import { db, type QueuedWrite } from './schema';
import { rememberRemap, remappedId } from './idRemap';
import { remapMovedOut } from '../stores/inboxGuard';
import { runStatusMigration } from './statusMigration';
import { recordError } from '../stores/errorReport';
import { remapPayload, remapQueuedRows } from './queueRemap';
import { tasksApi, projectsApi, labelsApi, filtersApi } from '../api/endpoints';
import { OfflineError, ApiError, api, renewTokenIfNeeded } from '../api/client';
import { alreadyDone } from './alreadyDone';
import { isBinProject } from '../utils/bin';
import { freezePlan } from '../utils/projectOrder';
import { projectMeta, withMeta } from '../utils/projectMeta';
import { purgeExpiredBin, binAbandoned } from '../actions/bin';
import { settings } from '../stores/settings.svelte';
import { syncStore } from '../stores/sync.svelte';
import { isConfigured } from '../api/config';
import type { VikunjaTask, VikunjaProject, VikunjaLabel, VikunjaFilter } from '../types';

// --- Full pull -------------------------------------------------------------
//
// V1 always does a full pull (no delta/since-token) for simplicity and
// correctness: Vikunja's `updated` filter semantics vary by deployment and
// getting a partial pull wrong silently drops data, which is worse than a
// slightly heavier request. This runs on connect, on reconnect, and every
// few minutes while online — see initSync() below.

async function idsWithPendingWrites(entity: QueuedWrite['entity']): Promise<Set<number>> {
	const items = await db.queue.where('entity').equals(entity).toArray();
	return new Set(items.map((i) => i.targetId));
}

export async function pull(): Promise<void> {
	// Signed out (19 Nov 2026: the Mac logged "Vikunja API URL is not configured" every 5 minutes
	// while it waited on the sign-in screen): nothing to fetch until you sign in again.
	if (!isConfigured()) return;
	syncStore.setSyncing();
	try {
		// Promise.allSettled rather than Promise.all: some Vikunja deployments
		// reject one of these endpoints outright (e.g. v2.6.0 has no working
		// `GET /api/v1/filters`) while the others work fine. A single broken
		// endpoint used to fail the *entire* pull — silently leaving tasks,
		// projects and labels stuck on whatever was mirrored locally at first
		// install, forever. Now each source degrades independently: whatever
		// fails keeps its last-known local data instead of blocking everything
		// else, and the failure is still surfaced once, below.
		// Vikunja 2.x has no "list saved filters" (405). Once seen, skip asking for a day
		// instead of adding a refused request to the server log on every sync.
		const noListAt = ((await db.meta.get('filtersListUnsupportedAt'))?.value as number | undefined) ?? 0;
		const skipList = Date.now() - noListAt < 24 * 60 * 60 * 1000;
		const [tasksR, projectsR, labelsR, filtersR] = await Promise.allSettled([
			tasksApi.allSince(),
			projectsApi.all(),
			labelsApi.all(),
			skipList ? Promise.reject(new ApiError(405, 'Method Not Allowed')) : filtersApi.list()
		]);
		const tasks = tasksR.status === 'fulfilled' ? tasksR.value : [];
		const projects = projectsR.status === 'fulfilled' ? projectsR.value : [];
		const labels = labelsR.status === 'fulfilled' ? labelsR.value : [];
		let filters: VikunjaFilter[] = filtersR.status === 'fulfilled' ? filtersR.value : [];
		// Some servers (e.g. Vikunja 2.6.0) answer 405 to "list saved
		// filters". That's a known, harmless gap — filters still arrive as
		// pseudo-projects — so it shouldn't turn the sync indicator red.
		const filtersUnsupported =
			filtersR.status === 'rejected' && filtersR.reason instanceof ApiError && filtersR.reason.status === 405;
		// Fallback: saved filters appear in the project list as pseudo-projects
		// with negative ids, and each one's real definition can be read one by
		// one at GET /filters/{-id - 1}.
		if (filtersUnsupported && !skipList) await db.meta.put({ key: 'filtersListUnsupportedAt', value: Date.now() });
		if (filtersUnsupported) {
			const pseudo = projects.filter((p) => p.id < 0);
			const fetched = await Promise.allSettled(
				pseudo.map((p) => filtersApi.get(-p.id - 1))
			);
			filters = fetched.flatMap((r) =>
				r.status === 'fulfilled' && r.value?.filters?.filter !== undefined ? [r.value] : []
			);
		}
		const failures = [tasksR, projectsR, labelsR, ...(filtersUnsupported ? [] : [filtersR])].filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected'
		);

		// Don't let a server snapshot clobber an edit we haven't flushed yet —
		// last-write-wins is decided in favour of "the write still in the
		// queue" rather than by timestamp, since our own optimistic write
		// already reflects the newest intent for that row.
		await migratePendingToDescriptions();
		await freezeProjectOrder();
		const dirtyTasks = await idsWithPendingWrites('task');
		const dirtyProjects = await idsWithPendingWrites('project');
		const dirtyLabels = await idsWithPendingWrites('label');
		const dirtyFilters = await idsWithPendingWrites('filter');

		const binProject = projects.find((p) => isBinProject(p)) ?? (await db.projects.filter((p) => isBinProject(p) && p.id > 0).first());
		await db.transaction('rw', db.tasks, db.projects, db.labels, db.filters, db.bin, async () => {
			for (const t of tasks) {
				if (dirtyTasks.has(t.id)) continue;
				// Tasks in the Bin project live in their own table, out of every view.
				if (binProject && t.project_id === binProject.id) {
					await db.bin.put(t);
					await db.tasks.delete(t.id);
					continue;
				}
				await db.bin.delete(t.id);
				const existing = await db.tasks.get(t.id);
				// Preserve local-only section assignment and order across pulls.
				await db.tasks.put({ ...t, section_id: existing?.section_id ?? null, local_order: existing?.local_order });
			}
			for (const p of projects) {
				if (dirtyProjects.has(p.id)) continue;
				const existing = await db.projects.get(p.id);
				await db.projects.put({ ...p, is_pending: projectMeta(p).pending });
			}
			for (const l of labels) {
				if (dirtyLabels.has(l.id)) continue;
				await db.labels.put(l);
			}
			for (const f of filters) {
				if (dirtyFilters.has(f.id)) continue;
				await db.filters.put(f);
			}
		});

		// Things deleted on another device (or by an automation) must disappear here too.
		// Only when that list was fetched completely, and never a row with unsent changes or
		// one that only exists locally so far (temporary negative id).
		await db.transaction('rw', db.tasks, db.projects, db.labels, db.bin, async () => {
			// An empty answer while this device holds many tasks is more likely a server
			// hiccup than a mass deletion: deleting nothing is the safe choice.
			const suspicious = tasks.length === 0 && (await db.tasks.count()) > 20;
			if (tasksR.status === 'fulfilled' && !suspicious) {
				const live = new Set(tasks.map((t) => t.id));
				// Vikunja does not list the tasks of archived projects: those are kept as they are.
				const archived = new Set((await db.projects.filter((p) => !!p.is_archived).toArray()).map((p) => p.id));
				const keep = new Set((await db.tasks.filter((t) => archived.has(t.project_id)).primaryKeys()) as number[]);
				const goneTasks = (await db.tasks.toCollection().primaryKeys()).filter((id) => id > 0 && !live.has(id) && !dirtyTasks.has(id) && !keep.has(id));
				if (goneTasks.length) await db.tasks.bulkDelete(goneTasks);
				const goneBin = (await db.bin.toCollection().primaryKeys()).filter((id) => id > 0 && !live.has(id) && !dirtyTasks.has(id));
				if (goneBin.length) await db.bin.bulkDelete(goneBin);
			}
			if (projectsR.status === 'fulfilled' && projects.length > 0) {
				const live = new Set(projects.map((p) => p.id));
				const gone = (await db.projects.toCollection().primaryKeys()).filter((id) => id > 0 && !live.has(id) && !dirtyProjects.has(id));
				if (gone.length) await db.projects.bulkDelete(gone);
			}
			if (labelsR.status === 'fulfilled') {
				const live = new Set(labels.map((l) => l.id));
				const gone = (await db.labels.toCollection().primaryKeys()).filter((id) => id > 0 && !live.has(id) && !dirtyLabels.has(id));
				if (gone.length) await db.labels.bulkDelete(gone);
			}
		});

		await db.meta.put({ key: 'lastPull', value: Date.now() });
		// Sections and task order made on your other devices (10 Nov 2026).
		void import('../stores/sectionSync').then(async (m) => { await m.pullSections(); await m.applySectionRestore(); }).catch(() => undefined);
		if (tasksR.status === 'fulfilled') {
			await binAbandoned().catch(() => 0);
			await purgeExpiredBin().catch(() => 0);
		}
		if (labelsR.status === 'fulfilled') await removeTaskContextLabels().catch(() => undefined);
		if (tasksR.status === 'fulfilled' && projectsR.status === 'fulfilled' && labelsR.status === 'fulfilled' && tasks.length > 0)
			void runStatusMigration(tasks, projects);
		if (failures.length > 0 && failures.every((f) => f.reason instanceof OfflineError)) {
			// The network dropped during the sync (a laptop waking up, a train): not a fault,
			// the next sync completes it (25 Oct 2026: shown as "Device errors" on the Mac).
			syncStore.setOffline();
		} else if (failures.length > 0) {
			const messages = failures.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)));
			syncStore.setError(`Partially synced — some data couldn't be fetched: ${messages.join('; ')}`);
		} else {
			syncStore.setSynced();
		}
	} catch (err) {
		if (err instanceof OfflineError) {
			syncStore.setOffline();
		} else {
			syncStore.setError(err instanceof Error ? err.message : String(err));
		}
	}
}

// --- Changes the server refused ------------------------------------------------
// Kept (last 30) so Settings can show exactly what did not make it, instead of a
// message that disappears.
export type FailedWrite = { at: number; entity: string; op: string; targetId: number; status: number; message: string; payload: unknown };
async function recordFailedWrite(w: QueuedWrite, err: ApiError): Promise<void> {
	const prev = ((await db.meta.get('failedWrites'))?.value as FailedWrite[] | undefined) ?? [];
	const entry: FailedWrite = { at: Date.now(), entity: w.entity, op: w.op, targetId: w.targetId, status: err.status, message: err.message, payload: w.payload };
	recordError('refused', `${w.op} ${w.entity} #${w.targetId}: ${err.message} (${err.status})`);
	await db.meta.put({ key: 'failedWrites', value: [entry, ...prev].slice(0, 30) });
}

async function forgetLocally(entity: QueuedWrite['entity'], id: number): Promise<void> {
	if (entity === 'task') {
		await db.tasks.delete(id);
		await db.bin.delete(id);
	} else if (entity === 'project') await db.projects.delete(id);
	else if (entity === 'label') await db.labels.delete(id);
	else if (entity === 'filter') await db.filters.delete(id);
}

// --- Queueing local writes ---------------------------------------------------

export { nextTempId } from './tempId';

export async function queueWrite(w: Omit<QueuedWrite, 'id' | 'createdAt'>): Promise<void> {
	// A change made just as a new task reaches the server can still name its temporary id: send it
	// to the real one (22 Oct 2026: a task added and validated at once sometimes lost its mark).
	const real = w.entity === 'task' ? remappedId(w.targetId) : undefined;
	await db.queue.add({ ...w, ...(real ? { targetId: real } : {}), createdAt: Date.now() });
	syncStore.setPendingCount(await db.queue.count());
	// Fire-and-forget: try to flush right away if we're online, but the
	// caller (which already applied the optimistic local write) doesn't
	// need to wait for network.
	flushQueue();
}

let flushing: Promise<void> | null = null;

// Callers that arrive while a flush is running wait for it and then run their own pass, so
// "await flushQueue()" always means the queue really has been drained (or the server refused).
export async function flushQueue(): Promise<void> {
	while (flushing) await flushing;
	flushing = runFlush().finally(() => {
		flushing = null;
	});
	return flushing;
}

async function runFlush(): Promise<void> {
	if (!isConfigured()) return; // signed out: the changes wait for the next sign-in
	try {
		const idMap = new Map<number, number>();
		let sent = 0;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const [next] = await db.queue.orderBy('createdAt').limit(1).toArray();
			if (!next) break;

			const targetId = idMap.get(next.targetId) ?? next.targetId;
			const payload = remapPayload(next.payload, idMap);

			try {
				await executeWrite(next.entity, next.op, targetId, payload, idMap);
				sent++;
				await db.queue.delete(next.id!);
				syncStore.setPendingCount(await db.queue.count());
			} catch (err) {
				if (err instanceof OfflineError) {
					syncStore.setOffline();
					return; // stop draining; will resume on 'online' event
				}
				// Signed out (expired session) or rate-limited: keep the change, it is sent after
				// the next sign-in / a little later. Never drop data for these.
				if (err instanceof ApiError && (err.status === 401 || err.status === 403 && /token|auth/i.test(err.message) || err.status === 408 || err.status === 429)) {
					syncStore.setError(err.status === 401 ? 'Signed out: sign in again to send your changes.' : err.message);
					return;
				}
				if (err instanceof ApiError && err.status >= 400 && err.status < 500 && alreadyDone(next.op, err.status, err.message)) {
					// Already the case on the server: done, not a failure.
					if (next.op === 'delete') await forgetLocally(next.entity, targetId);
					sent++;
					await db.queue.delete(next.id!);
					syncStore.setPendingCount(await db.queue.count());
					continue;
				}
				if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
					await recordFailedWrite(next, err);
					// Not retryable (e.g. entity was deleted server-side, bad
					// request) — drop it rather than blocking the whole queue
					// forever, but surface it so the user knows something didn't
					// make it through.
					syncStore.setError(`A change could not be synced: ${err.message}`);
					await db.queue.delete(next.id!);
					continue;
				}
				// 5xx or unknown — stop and retry later rather than dropping data.
				syncStore.setError(err instanceof Error ? err.message : String(err));
				return;
			}
		}
		syncStore.setSynced(sent > 0);
	} finally {
		// (the caller clears `flushing`)
	}
}

// One time: write the order projects are shown in (alphabetical where no position was ever set)
// into real positions, so the list stays exactly as it is and never reshuffles by itself.
async function freezeProjectOrder(): Promise<void> {
	if ((await db.meta.get('projectOrderFrozen'))?.value) return;
	const mine = await db.projects.toArray();
	if (mine.length === 0) return; // first sync on a new device: wait for the server's projects
	for (const u of freezePlan(mine)) {
		await db.projects.update(u.id, { position: u.position });
		await queueWrite({ entity: 'project', op: 'update', targetId: u.id, payload: { position: u.position } });
	}
	await db.meta.put({ key: 'projectOrderFrozen', value: true });
}

// One time: "pending" used to live only on the device. Write it into the description of
// every project that had it, so the other devices and the Mac folders can see it.
async function migratePendingToDescriptions(): Promise<void> {
	if ((await db.meta.get('pendingMigrated'))?.value) return;
	const mine = await db.projects.filter((p) => p.id > 0 && !!p.is_pending && !projectMeta(p).pending).toArray();
	for (const p of mine) {
		const description = withMeta(p.description, { pending: true });
		await db.projects.update(p.id, { description });
		await queueWrite({ entity: 'project', op: 'update', targetId: p.id, payload: { description } });
	}
	await db.meta.put({ key: 'pendingMigrated', value: true });
}

// One time: tasks no longer have a Pro / Perso context of their own (their project decides),
// so the two hidden labels that used to carry it are deleted from the server.
async function removeTaskContextLabels(): Promise<void> {
	if ((await db.meta.get('taskContextRemoved'))?.value) return;
	const old = await db.labels.filter((l) => l.id > 0 && /^ctx:(pro|perso)$/i.test(l.title)).toArray();
	for (const l of old) {
		await db.labels.delete(l.id);
		await queueWrite({ entity: 'label', op: 'delete', targetId: l.id, payload: null });
	}
	await db.meta.put({ key: 'taskContextRemoved', value: true });
}

async function executeWrite(
	entity: QueuedWrite['entity'],
	op: QueuedWrite['op'],
	targetId: number,
	payload: unknown,
	idMap: Map<number, number>
): Promise<void> {
	switch (entity) {
		case 'task':
			return executeTaskWrite(op, targetId, payload, idMap);
		case 'project':
			return executeProjectWrite(op, targetId, payload, idMap);
		case 'label':
			return executeLabelWrite(op, targetId, payload, idMap);
		case 'filter':
			return executeFilterWrite(op, targetId, payload);
		case 'section':
			return; // sections are purely local, nothing to sync
	}
}

async function executeTaskWrite(
	op: QueuedWrite['op'],
	targetId: number,
	payload: unknown,
	idMap: Map<number, number>
) {
	if (op === 'create') {
		const p = payload as Partial<VikunjaTask> & { project_id: number };
		const created = await tasksApi.create(p.project_id, p);
		idMap.set(targetId, created.id);
		rememberRemap(targetId, created.id);
		remapMovedOut(targetId, created.id);
		await remapQueuedRows(targetId, created.id);
		// Replace the temp-id row with the server-assigned one.
		await db.transaction('rw', db.tasks, async () => {
			const local = await db.tasks.get(targetId);
			await db.tasks.delete(targetId);
			// Labels set on this device meanwhile are kept: their own queued operations send them.
			await db.tasks.put({ ...created, labels: local?.labels?.length ? local.labels : created.labels, section_id: local?.section_id ?? null, local_order: local?.local_order });
		});
	} else if (op === 'update') {
		// Vikunja treats every field missing from an update as "empty" and clears it (a due or start
		// date set earlier would vanish when only the project changes). So the update always carries the
		// task's current values too, and the change itself goes last so it wins.
		// A task already moved to the Bin on this device is in db.bin (13 Nov 2026: without this, moving
		// a task to the Bin cleared its dates and its done state on the server).
		const local = ((await db.tasks.get(targetId)) ?? (await db.bin.get(targetId))) as unknown as Record<string, unknown> | undefined;
		const keep: Partial<VikunjaTask> = {};
		if (local) {
			for (const k of ['title', 'description', 'done', 'due_date', 'start_date', 'end_date', 'priority', 'percent_done', 'repeat_after', 'repeat_mode', 'hex_color', 'is_favorite', 'project_id', 'reminders'] as const) {
				if (local[k] !== undefined) (keep as Record<string, unknown>)[k] = local[k];
			}
		}
		const updated = await tasksApi.update(targetId, { ...keep, ...(payload as Partial<VikunjaTask>) });
		// The server's reply to an update does not reliably carry the task's labels (it can come
		// back empty), and labels are written by their own queued operation: never let this reply
		// overwrite them, or a task flagged "to validate" would silently lose its flag.
		// Nor its creation date: Vikunja 2.7 answers an update with created = 0001-01-01, which made
		// the task the "oldest" one and sent it to the bottom of the Inbox until the next reload.
		const { labels: _ignored, created: _c, ...rest } = updated as VikunjaTask;
		delete (updated as Partial<VikunjaTask>).created;
		if ((payload as Partial<VikunjaTask>).labels !== undefined) await db.tasks.update(targetId, updated as Partial<VikunjaTask>);
		else await db.tasks.update(targetId, rest as Partial<VikunjaTask>);
	} else if (op === 'delete') {
		await tasksApi.delete(targetId);
		await db.tasks.delete(targetId);
		await db.bin.delete(targetId);
	} else if (op === 'setLabels') {
		const { labelIds } = payload as { labelIds: number[] };
		await tasksApi.setLabels(targetId, labelIds);
		// Re-read so the local row shows exactly what the server holds.
		try {
			const fresh = await api.get<VikunjaTask>(`/api/v1/tasks/${targetId}`);
			await db.tasks.update(targetId, { labels: fresh.labels ?? [] } as Partial<VikunjaTask>);
		} catch {
			/* best effort */
		}
	} else if (op === 'addLabel' || op === 'removeLabel') {
		const { labelId } = payload as { labelId: number };
		if (op === 'addLabel') await tasksApi.addLabel(targetId, labelId);
		else await tasksApi.removeLabel(targetId, labelId);
		try {
			const fresh = await api.get<VikunjaTask>(`/api/v1/tasks/${targetId}`);
			await db.tasks.update(targetId, { labels: fresh.labels ?? [] } as Partial<VikunjaTask>);
		} catch {
			/* best effort */
		}
	} else if (op === 'addRelation') {
		const { otherTaskId, kind } = payload as { otherTaskId: number; kind: 'precedes' | 'follows' };
		await tasksApi.addRelation(targetId, otherTaskId, kind);
	} else if (op === 'removeRelation') {
		const { otherTaskId, kind } = payload as { otherTaskId: number; kind: string };
		await tasksApi.removeRelation(targetId, kind, otherTaskId);
	}
}

async function executeProjectWrite(
	op: QueuedWrite['op'],
	targetId: number,
	payload: unknown,
	idMap: Map<number, number>
) {
	if (op === 'create') {
		const created = await projectsApi.create(payload as Partial<VikunjaProject>);
		idMap.set(targetId, created.id);
		await remapQueuedRows(targetId, created.id);
		await db.transaction('rw', db.projects, async () => {
			const local = await db.projects.get(targetId);
			await db.projects.delete(targetId);
			await db.projects.put({ ...created, is_pending: projectMeta(created).pending || (local?.is_pending ?? false) });
		});
	} else if (op === 'update') {
		// Vikunja's update replaces every field it is not sent, so send the whole project
		// (local copy already holds this change), not just the changed part.
		const local = await db.projects.get(targetId);
		const body: Partial<VikunjaProject> = local
			? {
					title: local.title,
					description: local.description ?? '',
					hex_color: local.hex_color ?? '',
					is_archived: local.is_archived ?? false,
					parent_project_id: local.parent_project_id ?? 0,
					...(payload as Partial<VikunjaProject>)
				}
			: (payload as Partial<VikunjaProject>);
		if ('parent_project_id' in body && body.parent_project_id === undefined) body.parent_project_id = 0;
		const updated = await projectsApi.update(targetId, body);
		await db.projects.update(targetId, updated as Partial<VikunjaProject>);
	} else if (op === 'delete') {
		await projectsApi.delete(targetId);
		await db.projects.delete(targetId);
	}
}

async function executeLabelWrite(
	op: QueuedWrite['op'],
	targetId: number,
	payload: unknown,
	idMap: Map<number, number>
) {
	if (op === 'create') {
		const created = await labelsApi.create(payload as { title: string; hex_color: string });
		idMap.set(targetId, created.id);
		await remapQueuedRows(targetId, created.id);
		await db.labels.delete(targetId);
		await db.labels.put(created);
	} else if (op === 'update') {
		const updated = await labelsApi.update(targetId, payload as Partial<VikunjaLabel>);
		await db.labels.update(targetId, updated as Partial<VikunjaLabel>);
	} else if (op === 'delete') {
		await labelsApi.delete(targetId);
		await db.labels.delete(targetId);
	}
}

async function executeFilterWrite(op: QueuedWrite['op'], targetId: number, payload: unknown) {
	if (op === 'create') {
		const created = await filtersApi.create(payload as { title: string; filters: { filter: string } });
		await db.filters.delete(targetId);
		await db.filters.put(created);
		// keep the filter where it is in the saved order
		settings.setFilterOrder(settings.filterOrder.map((i) => (i === targetId ? created.id : i)));
	} else if (op === 'update') {
		const updated = await filtersApi.update(targetId, payload as Partial<VikunjaFilter>);
		await db.filters.update(targetId, updated as Partial<VikunjaFilter>);
	} else if (op === 'delete') {
		await filtersApi.delete(targetId);
		await db.filters.delete(targetId);
	}
}

// --- Lifecycle ---------------------------------------------------------------

let pullInterval: ReturnType<typeof setInterval> | undefined;

let started = false;
export function initSync(): void {
	if (typeof window === 'undefined') return;
	// Several screens call this (layout, quick-add, after sign-in): only one set of timers.
	if (started) {
		renewTokenIfNeeded().then(flushQueue).then(pull);
		return;
	}
	started = true;

	db.queue.count().then((n) => syncStore.setPendingCount(n));

	window.addEventListener('online', () => {
		flushQueue().then(pull);
	});
	window.addEventListener('offline', () => syncStore.setOffline());

	renewTokenIfNeeded().finally(() => {
		pull();
		flushQueue();
	});

	// Coming back to the app (phone unlocked, window focused): send and fetch now rather
	// than up to five minutes later. At most every 30 s.
	let lastWake = 0;
	const wake = () => {
		if (document.visibilityState !== 'visible' || Date.now() - lastWake < 30_000) return;
		lastWake = Date.now();
		renewTokenIfNeeded().then(flushQueue).then(pull);
	};
	document.addEventListener('visibilitychange', wake);
	window.addEventListener('focus', wake);

	// Keep the short-lived sign-in fresh.
	setInterval(() => void renewTokenIfNeeded(), 60 * 1000);

	// Periodic background pull so changes made from another device (or by a
	// server-side automation) show up here without a manual refresh.
	pullInterval = setInterval(
		() => {
			// Also when the server was unreachable (PC off): navigator.onLine stays true then,
			// so this periodic attempt is what notices the server is back.
			if (navigator.onLine) {
				renewTokenIfNeeded().then(flushQueue).then(pull);
			}
		},
		5 * 60 * 1000
	);
}

export function stopSync(): void {
	if (pullInterval) clearInterval(pullInterval);
}
