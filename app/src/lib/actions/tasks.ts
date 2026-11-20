import { remappedId } from '../db/idRemap';
import { capitalizeFirst } from '../utils/text';
import { recorded, rememberCreated } from '../stores/history.svelte';
import { inReview, isInboxProject, REVIEW_LABEL, VALIDATED_LABEL, validatedMarkInUse, dueLabelLock, PENDING_LABEL, ABANDONED_LABEL, isAbandoned } from '../utils/context';
import { rememberMovedOut, forgetMovedOut } from '../stores/inboxGuard';
import { releaseFromInbox, backToInbox } from '../stores/inboxSticky';
import { db } from '../db/schema';
import { binTask, restoreFromBin } from './bin';
import { queueWrite, nextTempId } from '../db/sync';
import { toastStore } from '../stores/toast.svelte';
import { duplicateInput, copyTitle, relationsToCopy } from '../utils/taskCopy';
import { hasDate } from '../utils/dates';
import { repeatKind, nextDue } from '../utils/recurrence';
import type { VikunjaTask } from '../types';

// Every action here follows the same shape: write to IndexedDB immediately
// (so the UI updates instantly, online or not), then queue the write for
// the sync engine to replay against the API. Nothing in the UI layer talks
// to the API directly — see spec "Synchronisation" / "Stockage local".

// The id to use now: a new task's temporary id becomes its real id as soon as the server saved it.
const liveId = (id: number) => remappedId(id) ?? id;

async function createTaskNow(input: {
	title: string;
	project_id: number;
	description?: string;
	start_date?: string | null;
	due_date?: string | null;
	label_ids?: number[];
	priority?: number;
	repeat_after?: number;
	repeat_mode?: number;
	// Local only: straight into a section of the project page, at a place in your own order.
	section_id?: number | null;
	local_order?: number;
}): Promise<number> {
	input = { ...input, title: capitalizeFirst(input.title) };
	const id = nextTempId();
	// Labels are added just after (setTaskLabels below sends each one); the row starts without.
	const labels: VikunjaTask['labels'] = [];
	const now = new Date().toISOString();
	const task: VikunjaTask = {
		id,
		title: input.title,
		description: input.description,
		done: false,
		due_date: input.due_date ?? null,
		start_date: input.start_date ?? now,
		project_id: input.project_id,
		labels,
		priority: input.priority,
		repeat_after: input.repeat_after,
		repeat_mode: input.repeat_mode,
		created: now,
		updated: now,
		section_id: input.section_id ?? null,
		local_order: input.local_order
	};
	await db.tasks.put(task);
	await queueWrite({
		entity: 'task',
		op: 'create',
		targetId: id,
		payload: {
			title: input.title,
			description: input.description,
			project_id: input.project_id,
			due_date: input.due_date ?? null,
			start_date: input.start_date ?? now,
			priority: input.priority,
			repeat_after: input.repeat_after,
			repeat_mode: input.repeat_mode
		}
	});
	if (input.label_ids?.length) {
		await setTaskLabels(id, input.label_ids);
	}
	return id;
}

async function updateTaskNow(id: number, patch: Partial<VikunjaTask>): Promise<void> {
	id = liveId(id);
	await db.tasks.update(id, { ...patch, updated: new Date().toISOString() });
	await queueWrite({ entity: 'task', op: 'update', targetId: id, payload: patch });
}

async function completeTaskNow(id: number, done = true): Promise<void> {
	id = liveId(id);
	if (done) releaseFromInbox(id);
	// Reopening an abandoned task makes it an ordinary open task again.
	if (!done) {
		const t = await db.tasks.get(id);
		if (t && isAbandoned(t)) await setTaskLabelsNow(id, (t.labels ?? []).filter((l) => l.title.toLowerCase() !== ABANDONED_LABEL).map((l) => l.id));
	}
	// A repeating task is never closed: completing it moves it to its next due date.
	if (done) {
		const t = await db.tasks.get(id);
		const kind = t ? repeatKind(t) : 'none';
		if (t && kind !== 'none' && hasDate(t.due_date)) {
			const oldDue = new Date(t.due_date);
			const days = Math.max(1, Math.round((t.repeat_after ?? 86400) / 86400));
			const next = nextDue(oldDue, kind, new Date(), days);
			const patch: Partial<VikunjaTask> = { due_date: next.toISOString(), done: false, done_at: null };
			if (hasDate(t.start_date)) patch.start_date = new Date(new Date(t.start_date).getTime() + (next.getTime() - oldDue.getTime())).toISOString();
			await updateTask(id, patch);
			toastStore.success(
				`Done. Next: ${next.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
			);
			return;
		}
	}
	await updateTask(id, { done, done_at: done ? new Date().toISOString() : null });
}

// Marks every completed task as not completed. Returns how many were changed.
export async function uncompleteAllTasks(): Promise<number> {
	const done = await db.tasks.filter((t) => t.done && t.id > 0).toArray();
	for (const t of done) await completeTask(t.id, false);
	return done.length;
}

async function deleteTaskNow(id: number, opts: { quiet?: boolean } = {}): Promise<void> {
	id = liveId(id);
	forgetMovedOut(id);
	releaseFromInbox(id);
	// Nothing is lost: the task goes to the Bin for 30 days. "Undo" puts it straight back where it was.
	const snapshot = await binTask(id);
	if (opts.quiet) return;
	toastStore.success('Task moved to the Bin', {
		label: 'Undo',
		onClick: () => {
			if (snapshot) void restoreFromBin(id, snapshot.project_id);
		}
	});
}

async function moveTaskToProjectNow(id: number, projectId: number): Promise<void> {
	id = liveId(id);
	const task = await db.tasks.get(id);
	if (task && task.project_id !== projectId) {
		const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
		const leavingInbox = isInboxProject(task.project_id, projects);
		const validated = (task.labels ?? []).some((l) => l.title.toLowerCase() === VALIDATED_LABEL);
		// 19 Nov 2026 (Lou): moving a task from the Inbox page into a project (drag onto a project
		// in the menu, its project on the row, the selection's Move) also validates it.
		const fromInboxPage = typeof location !== 'undefined' && location.pathname === '/inbox';
		if (isInboxProject(projectId, projects)) {
			// Back in the Inbox: to validate again.
			await unvalidateTask(id);
		} else if (fromInboxPage && !validated) {
			await updateTask(id, { project_id: projectId, section_id: null });
			await validateTaskNow(id);
			return;
		} else if (leavingInbox && !validated) {
			// Still to validate: it stays in the Inbox view until you validate it.
			rememberMovedOut(id);
			// The old "to validate" flag too: before the one-time marking it is what keeps it there,
			// and app versions older than 19 Oct 2026 still read it.
			await addTaskLabel(id, await ensureHiddenLabel(REVIEW_LABEL, 'ffd152'));
		}
	}
	await updateTask(id, { project_id: projectId, section_id: null });
}

async function renameTaskNow(id: number, title: string): Promise<void> {
	await updateTask(id, { title: capitalizeFirst(title) });
}

async function setTaskLabelsNow(id: number, labelIds: number[]): Promise<void> {
	id = liveId(id);
	// Only the difference with what this device shows is sent, one label at a time (addLabel /
	// removeLabel). A label this device does not show is never touched: an older copy of a task
	// can no longer erase labels set elsewhere (such as the "validated" mark).
	const task = await db.tasks.get(id);
	const current = (task?.labels ?? []).map((l) => l.id);
	const added = labelIds.filter((l) => !current.includes(l));
	const removed = current.filter((l) => !labelIds.includes(l));
	if (!added.length && !removed.length) return;
	const known = await db.labels.bulkGet(added);
	const addedLabels = added.map((lid, i) => known[i]).filter((l): l is NonNullable<typeof l> => !!l);
	const labels = [...(task?.labels ?? []).filter((l) => !removed.includes(l.id)), ...addedLabels];
	await db.tasks.update(id, { labels });
	for (const labelId of removed) await queueWrite({ entity: 'task', op: 'removeLabel', targetId: id, payload: { labelId } });
	for (const labelId of added) await queueWrite({ entity: 'task', op: 'addLabel', targetId: id, payload: { labelId } });
}

async function addTaskLabelNow(id: number, labelId: number): Promise<void> {
	id = liveId(id);
	const task = await db.tasks.get(id);
	const current = task?.labels?.map((l) => l.id) ?? [];
	if (current.includes(labelId)) return;
	await setTaskLabels(id, [...current, labelId]);
	// The shopping label given from the label picker does what 🛒 does (13 Nov 2026, task "Quand je
	// mets le caddie, direct valider"): out of the Inbox, onto the Shopping list, validated.
	const label = await db.labels.get(labelId);
	if (task && label?.title.trim().toLowerCase() === 'shopping' && (inReview(task) || isInboxProject(task.project_id, new Map((await db.projects.toArray()).map((p) => [p.id, p]))))) {
		const { setShopping } = await import('./shopping');
		await setShopping(id, true);
	}
}

async function removeTaskLabelNow(id: number, labelId: number): Promise<void> {
	id = liveId(id);
	const task = await db.tasks.get(id);
	const lbl = task?.labels?.find((l) => l.id === labelId);
	const lock = task && lbl ? dueLabelLock(task, lbl.title) : null;
	if (lock) {
		toastStore.error(lock);
		return;
	}
	const current = task?.labels?.map((l) => l.id) ?? [];
	await setTaskLabels(
		id,
		current.filter((l) => l !== labelId)
	);
}

export async function duplicateTask(id: number): Promise<number> {
	const original = await db.tasks.get(id);
	if (!original) throw new Error('Task not found');
	const sameProject = await db.tasks.where('project_id').equals(original.project_id).toArray();
	const newId = await createTask({
		...duplicateInput(original),
		title: copyTitle(original.title, sameProject.map((t) => t.title))
	});
	// Same links as the original (it follows / precedes the same tasks).
	for (const [kind, otherId] of relationsToCopy(original)) await addRelation(newId, otherId, kind);
	return newId;
}

const INVERSE: Record<string, string> = { precedes: 'follows', follows: 'precedes' };

// Mirrors a link (and its inverse on the other task) into the local copy so
// the UI updates at once; the server write follows through the queue.
async function mirrorRelation(taskId: number, otherId: number, kind: string, add: boolean) {
	const apply = async (id: number, otherTaskId: number, k: string) => {
		const t = await db.tasks.get(id);
		const o = await db.tasks.get(otherTaskId);
		if (!t || !o) return;
		const rt: Record<string, { id: number; title: string; done: boolean }[]> = { ...(t.related_tasks ?? {}) };
		const list = (rt[k] ?? []).filter((r) => r.id !== otherTaskId);
		if (add) list.push({ id: o.id, title: o.title, done: o.done });
		if (list.length) rt[k] = list;
		else delete rt[k];
		await db.tasks.update(id, { related_tasks: rt });
	};
	await apply(taskId, otherId, kind);
	if (INVERSE[kind]) await apply(otherId, taskId, INVERSE[kind]);
}

export async function addRelation(
	taskId: number,
	otherTaskId: number,
	kind: 'precedes' | 'follows'
): Promise<void> {
	await mirrorRelation(taskId, otherTaskId, kind, true);
	await queueWrite({ entity: 'task', op: 'addRelation', targetId: taskId, payload: { otherTaskId, kind } });
}

export async function removeRelation(taskId: number, otherTaskId: number, kind: string): Promise<void> {
	await mirrorRelation(taskId, otherTaskId, kind, false);
	await queueWrite({ entity: 'task', op: 'removeRelation', targetId: taskId, payload: { otherTaskId, kind } });
}

async function moveTaskToSectionNow(id: number, sectionId: number | null): Promise<void> {
	// Purely local — sections don't exist in Vikunja.
	await db.tasks.update(id, { section_id: sectionId });
}

// Puts every task back to "to validate", so they all show up in the Inbox view again.
// Projects and everything else stay untouched.
export async function sendAllToInbox(): Promise<number> {
	const all = await db.tasks.toArray();
	let n = 0;
	for (const t of all) {
		if (inReview(t)) continue;
		await unvalidateTask(t.id);
		n++;
	}
	return n;
}

// You validate a task: it leaves the Inbox view. The only thing that adds the "validated" mark.
async function validateTaskNow(id: number): Promise<void> {
	id = liveId(id);
	forgetMovedOut(id);
	releaseFromInbox(id);
	const task = await db.tasks.get(id);
	if (!task) return;
	const validatedId = await ensureHiddenLabel(VALIDATED_LABEL, '4caf50');
	const keep = (task.labels ?? []).filter((l) => l.title.toLowerCase() !== REVIEW_LABEL).map((l) => l.id);
	await setTaskLabels(id, [...keep.filter((l) => l !== validatedId), validatedId]);
}

// Back to "to validate" (moved back to the Inbox project, restored from the Bin, fresh start).
async function unvalidateTaskNow(id: number): Promise<void> {
	id = liveId(id);
	backToInbox(id);
	const task = await db.tasks.get(id);
	if (!task) return;
	const keep = (task.labels ?? []).filter((l) => l.title.toLowerCase() !== VALIDATED_LABEL).map((l) => l.id);
	if (validatedMarkInUse()) await setTaskLabels(id, keep);
	else await setTaskLabels(id, [...keep, await ensureHiddenLabel(REVIEW_LABEL, 'ffd152')].filter((v, i, a) => a.indexOf(v) === i));
}

export async function ensureHiddenLabel(title: string, hex: string): Promise<number> {
	const existing = await db.labels.filter((l) => l.title.toLowerCase() === title).first();
	if (existing) return existing.id;
	// Not in this device's label list, but already on some task: reuse it (never a second copy).
	const onTask = (await db.tasks.filter((t) => (t.labels ?? []).some((l) => l.title.toLowerCase() === title && l.id > 0)).first())?.labels?.find((l) => l.title.toLowerCase() === title);
	if (onTask) {
		await db.labels.put(onTask);
		return onTask.id;
	}
	const id = nextTempId();
	await db.labels.put({ id, title, hex_color: hex });
	await queueWrite({ entity: 'label', op: 'create', targetId: id, payload: { title, hex_color: hex } });
	return id;
}

// Put a task on hold, or resume it (10 Nov 2026): a hidden label, see utils/context.ts.
async function setTaskPendingNow(id: number, on: boolean): Promise<void> {
	const task = await db.tasks.get(id);
	if (!task) return;
	const keep = (task.labels ?? []).filter((l) => l.title.toLowerCase() !== PENDING_LABEL).map((l) => l.id);
	await setTaskLabelsNow(id, on ? [...keep, await ensureHiddenLabel(PENDING_LABEL, '9e9e9e')] : keep);
}

// Abandon a task (11 Nov 2026): closed without being done. Marked done, so it leaves every list,
// with the hidden label ctx:abandoned so that it never counts as done; a repeating task stops
// repeating. abandonTask(id, false) reopens it.
async function abandonTaskNow(id: number, on = true): Promise<void> {
	id = liveId(id);
	if (!on) return completeTaskNow(id, false);
	const task = await db.tasks.get(id);
	if (!task) return;
	releaseFromInbox(id);
	const keep = (task.labels ?? []).filter((l) => l.title.toLowerCase() !== ABANDONED_LABEL).map((l) => l.id);
	await setTaskLabelsNow(id, [...keep, await ensureHiddenLabel(ABANDONED_LABEL, '9e9e9e')]);
	// Stop the repeat first, in its own change: the server repeats a task closed while it still repeats.
	if (task.repeat_after || task.repeat_mode) await updateTaskNow(id, { repeat_after: 0, repeat_mode: 0 });
	await updateTaskNow(id, { done: true, done_at: new Date().toISOString() });
	// And into the Bin (13 Nov 2026), with the deleted ones: kept 30 days, Restore brings it back.
	const { binTask } = await import('./bin');
	await binTask(id);
}

// Every change above can be undone (stores/history.svelte.ts): each public action is remembered.
export const updateTask: typeof updateTaskNow = (...a: Parameters<typeof updateTaskNow>) => recorded('Change', [a[0]], () => updateTaskNow(...a));
export const completeTask: typeof completeTaskNow = (...a: Parameters<typeof completeTaskNow>) => recorded('Complete', [a[0]], () => completeTaskNow(...a));
export const deleteTask: typeof deleteTaskNow = (...a: Parameters<typeof deleteTaskNow>) => recorded('Move to the Bin', [a[0]], () => deleteTaskNow(...a));
export const moveTaskToProject: typeof moveTaskToProjectNow = (...a: Parameters<typeof moveTaskToProjectNow>) => recorded('Move to a project', [a[0]], () => moveTaskToProjectNow(...a));
export const renameTask: typeof renameTaskNow = (...a: Parameters<typeof renameTaskNow>) => recorded('Rename', [a[0]], () => renameTaskNow(...a));
export const setTaskLabels: typeof setTaskLabelsNow = (...a: Parameters<typeof setTaskLabelsNow>) => recorded('Labels', [a[0]], () => setTaskLabelsNow(...a));
export const addTaskLabel: typeof addTaskLabelNow = (...a: Parameters<typeof addTaskLabelNow>) => recorded('Add a label', [a[0]], () => addTaskLabelNow(...a));
export const removeTaskLabel: typeof removeTaskLabelNow = (...a: Parameters<typeof removeTaskLabelNow>) => recorded('Remove a label', [a[0]], () => removeTaskLabelNow(...a));
export const moveTaskToSection: typeof moveTaskToSectionNow = (...a: Parameters<typeof moveTaskToSectionNow>) => recorded('Move to a section', [a[0]], () => moveTaskToSectionNow(...a));
export const validateTask: typeof validateTaskNow = (...a: Parameters<typeof validateTaskNow>) => recorded('Validate', [a[0]], () => validateTaskNow(...a));
export const unvalidateTask: typeof unvalidateTaskNow = (...a: Parameters<typeof unvalidateTaskNow>) => recorded('Back to the Inbox', [a[0]], () => unvalidateTaskNow(...a));
export const setTaskPending: typeof setTaskPendingNow = (...a: Parameters<typeof setTaskPendingNow>) => recorded(a[1] ? 'Mark pending' : 'Resume', [a[0]], () => setTaskPendingNow(...a));
export const abandonTask: typeof abandonTaskNow = (...a: Parameters<typeof abandonTaskNow>) => recorded(a[1] === false ? 'Reopen' : 'Abandon', [a[0]], () => abandonTaskNow(...a));
export const createTask: typeof createTaskNow = (...a: Parameters<typeof createTaskNow>) => rememberCreated('Add a task', () => createTaskNow(...a));
