import { db } from '../db/schema';
import { queueWrite, nextTempId } from '../db/sync';
import { toastStore } from '../stores/toast.svelte';
import { descriptionWithType, projectOwnType, inferredContext, type Context } from '../utils/context';
import { descendantProjectIds } from '../db/queries';
import { computeMove, positionAtEnd, type DropWhere } from '../utils/projectOrder';
import { withMeta, today } from '../utils/projectMeta';
import type { VikunjaProject } from '../types';

// A project made or moved by hand always lands at the bottom of its new siblings; nothing is
// ever reordered automatically.
async function endPosition(parentId: number | undefined, exceptId?: number): Promise<number> {
	const siblings = await db.projects
		.filter((p) => p.id !== exceptId && (p.parent_project_id || 0) === (parentId || 0) && !p.is_archived && p.id !== 0)
		.toArray();
	return positionAtEnd(siblings.filter((p) => p.id > 0 || p.position !== undefined));
}

export async function createProject(input: {
	title: string;
	parent_project_id?: number;
	is_pending?: boolean;
	context?: Context | null;
}): Promise<number> {
	const id = nextTempId();
	const position = await endPosition(input.parent_project_id);
	const project: VikunjaProject = {
		id,
		title: input.title,
		position,
		parent_project_id: input.parent_project_id,
		is_pending: input.is_pending ?? false,
		description: input.is_pending || input.context ? withMeta('', { pending: !!input.is_pending, ctx: input.context ? (input.context.toLowerCase() as 'pro' | 'perso') : null }) : undefined
	};
	await db.projects.put(project);
	await queueWrite({
		entity: 'project',
		op: 'create',
		targetId: id,
		payload: { title: input.title, parent_project_id: input.parent_project_id, description: project.description }
	});
	// The server picks its own position on creation; this puts it back at the bottom.
	await queueWrite({ entity: 'project', op: 'update', targetId: id, payload: { position } });
	toastStore.success(`Project "${input.title}" created`);
	return id;
}

export async function renameProject(id: number, title: string): Promise<void> {
	await db.projects.update(id, { title });
	await queueWrite({ entity: 'project', op: 'update', targetId: id, payload: { title } });
}

export async function moveProject(id: number, parentProjectId: number | undefined): Promise<void> {
	const position = await endPosition(parentProjectId, id);
	await db.projects.update(id, { parent_project_id: parentProjectId, position });
	await queueWrite({
		entity: 'project',
		op: 'update',
		targetId: id,
		payload: { parent_project_id: parentProjectId, position }
	});
}

// Drag and drop in the project panel: drop before / after a project (same level as it) or
// inside it (becomes its last sub-project). Returns false when the drop is not allowed.
export async function dropProject(dragId: number, targetId: number, where: DropWhere): Promise<boolean> {
	const all = await db.projects.filter((p) => p.id > 0).toArray();
	const move = computeMove(all, dragId, targetId, where);
	if (!move) return false;
	const before = new Map(all.map((p) => [p.id, p]));
	const oldCtx = inferredContext(dragId, before);
	for (const u of move.updates) {
		await db.projects.update(u.id, { parent_project_id: u.parent || undefined, position: u.position });
		await queueWrite({
			entity: 'project',
			op: 'update',
			targetId: u.id,
			payload: { parent_project_id: u.parent || undefined, position: u.position }
		});
	}
	await followContextAfterDrop(dragId, targetId, where, oldCtx);
	return true;
}

// Dragging a project from the Perso side to the Pro side (or the reverse) changes its context
// with it. Dropped next to a project at the top level, it takes that project's context;
// dropped somewhere untyped it keeps the one it had.
async function followContextAfterDrop(dragId: number, targetId: number, where: DropWhere, oldCtx: Context | null): Promise<void> {
	const byId = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
	const target = byId.get(targetId);
	if (!target) return;
	const parentId = where === 'inside' ? target.id : target.parent_project_id || 0;
	const newCtx = inferredContext(parentId || target.id, byId);
	const want = newCtx ?? oldCtx;
	if (!want) return;
	const dragged = byId.get(dragId);
	if (!dragged) return;
	const now = inferredContext(dragId, byId);
	if (now === want && projectOwnType(dragged) === want) return; // already agrees
	if (now === want && newCtx === want && !projectOwnType(dragged)) return; // inherits it, nothing of its own to fix
	await setProjectType(dragId, want);
	if (want !== oldCtx) toastStore.success(`“${dragged.title}” is now ${want}`);
}

export async function deleteProject(id: number): Promise<void> {
	const project = await db.projects.get(id);
	await db.projects.delete(id);
	await queueWrite({ entity: 'project', op: 'delete', targetId: id, payload: null });
	toastStore.success(`Project "${project?.title ?? ''}" deleted`);
}

// Pending status is a purely local metadata layer (see spec "Gestion du
// statut pending") — Vikunja itself is never told about it, so this write
// never touches the sync queue. When every task in the project is
// activated, all of them get start_date = now, per spec.
export async function setProjectPending(id: number, isPending: boolean): Promise<void> {
	// The setting travels in the description so every device (and the Mac folders) agree.
	// Starting a pending project stamps today's date, which then prefixes its folder name.
	const current = await db.projects.get(id);
	const description = withMeta(current?.description, isPending ? { pending: true, start: null } : { pending: false, start: today() });
	await db.projects.update(id, { is_pending: isPending, description });
	await queueWrite({ entity: 'project', op: 'update', targetId: id, payload: { description } });
	if (!isPending) {
		const now = new Date().toISOString();
		const tasks = await db.tasks.where('project_id').equals(id).toArray();
		await db.transaction('rw', db.tasks, async () => {
			for (const t of tasks) {
				await db.tasks.update(t.id, { start_date: now });
			}
		});
		// Each task's new start_date must also reach the server.
		for (const t of tasks) {
			await queueWrite({
				entity: 'task',
				op: 'update',
				targetId: t.id,
				payload: { start_date: now }
			});
		}
	}
}

async function writeDescription(id: number, description: string): Promise<void> {
	await db.projects.update(id, { description });
	await queueWrite({ entity: 'project', op: 'update', targetId: id, payload: { description } });
}

// Gives a project (and so every sub-project under it) a Pro / Perso setting, or none.
// Settings further down are cleared so the whole tree agrees.
export async function setProjectType(id: number, ctx: Context | null): Promise<void> {
	const project = await db.projects.get(id);
	if (!project) return;
	const ids = await descendantProjectIds(id);
	for (const pid of ids) {
		const p = await db.projects.get(pid);
		if (!p) continue;
		const want = pid === id ? ctx : null;
		if (projectOwnType(p) !== want) await writeDescription(pid, descriptionWithType(p.description, want));
	}
}

// Archiving a finished project hides it (and everything under it) from the tree and the
// pickers; nothing is deleted, and it can be restored. Its sub-projects follow it, otherwise
// they would pop up at the top level.
/**
 * Archives a finished project (and its sub-projects): refused while it has open tasks, on this
 * device or on the server (5 Nov 2026: the server may hold one this device has not received yet).
 */
export async function archiveIfFinished(id: number): Promise<{ ok: boolean; message: string }> {
	const ids = await descendantProjectIds(id);
	let open = await db.tasks.filter((t) => !t.done && ids.has(t.project_id)).count();
	if (open === 0) {
		if (typeof navigator !== 'undefined' && !navigator.onLine)
			return { ok: false, message: 'Archiving needs the server (to check that nothing is still open): try again when online.' };
		try {
			const { tasksApi } = await import('../api/endpoints');
			open = (await tasksApi.allSince()).filter((t) => !t.done && ids.has(t.project_id)).length;
		} catch {
			return { ok: false, message: 'Could not check the project on the server: try again in a moment.' };
		}
	}
	if (open > 0) return { ok: false, message: `Finish or move its ${open} open task${open === 1 ? '' : 's'} first, then archive.` };
	const title = (await db.projects.get(id))?.title ?? 'The project';
	await archiveProject(id, true);
	return { ok: true, message: `"${title}" archived` };
}

export async function archiveProject(id: number, archived: boolean): Promise<void> {
	const ids = await descendantProjectIds(id);
	const day = today();
	for (const pid of ids) {
		const current = await db.projects.get(pid);
		const description = withMeta(current?.description, { end: archived ? day : null });
		await db.projects.update(pid, { is_archived: archived, description });
		await queueWrite({ entity: 'project', op: 'update', targetId: pid, payload: { is_archived: archived, description } });
	}
}
