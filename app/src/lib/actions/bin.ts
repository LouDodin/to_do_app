import { db } from '../db/schema';
import { queueWrite, nextTempId } from '../db/sync';
import { getInboxProject } from '../db/queries';
import { isBinProject, binExpired } from '../utils/bin';
import type { VikunjaTask } from '../types';
import { isAbandoned, ABANDONED_LABEL } from '../utils/context';

// Finds the Bin project, creating it the first time something is deleted.
export async function ensureBinProject(): Promise<number> {
	const existing = await db.projects.filter((p) => isBinProject(p)).first();
	if (existing) return existing.id;
	const id = nextTempId();
	await db.projects.put({ id, title: 'Bin', parent_project_id: undefined, is_pending: false });
	await queueWrite({ entity: 'project', op: 'create', targetId: id, payload: { title: 'Bin' } });
	return id;
}

// "Deleting" a task: it moves to the Bin project and is kept for 30 days.
export async function binTask(id: number): Promise<VikunjaTask | undefined> {
	const task = await db.tasks.get(id);
	if (!task) return undefined;
	const binId = await ensureBinProject();
	await db.transaction('rw', db.tasks, db.bin, async () => {
		await db.tasks.delete(id);
		await db.bin.put({ ...task, project_id: binId, updated: new Date().toISOString() });
	});
	await queueWrite({ entity: 'task', op: 'update', targetId: id, payload: { project_id: binId } });
	return task;
}

// Brings a task back: into the Inbox unless a project is given.
export async function restoreFromBin(id: number, projectId?: number): Promise<void> {
	const task = await db.bin.get(id);
	if (!task) return;
	const target = projectId ?? (await getInboxProject())?.id;
	if (!target) return;
	await db.transaction('rw', db.tasks, db.bin, async () => {
		await db.bin.delete(id);
		await db.tasks.put({ ...task, project_id: target, done: false, section_id: null });
	});
	await queueWrite({ entity: 'task', op: 'update', targetId: id, payload: { project_id: target, done: false } });
	// Back in the Inbox: to validate again. (Undo right after deleting keeps its status.)
	if (projectId === undefined) {
		const { unvalidateTask } = await import('./tasks');
		await unvalidateTask(id);
	}
	// An abandoned task brought back is a task to do again.
	if (isAbandoned(task)) {
		const { removeTaskLabel } = await import('./tasks');
		const l = (task.labels ?? []).find((x) => x.title.toLowerCase() === ABANDONED_LABEL);
		if (l) await removeTaskLabel(id, l.id);
	}
}

// Permanent removal: only from the Bin, on request or after 30 days.
export async function eraseFromBin(id: number): Promise<void> {
	await db.bin.delete(id);
	await queueWrite({ entity: 'task', op: 'delete', targetId: id, payload: null });
}

// Tasks abandoned before 13 Nov 2026 stayed in their project: they join the Bin too.
export async function binAbandoned(): Promise<number> {
	const left = await db.tasks.filter((t) => t.done && isAbandoned(t) && t.id > 0).toArray();
	for (const t of left) await binTask(t.id);
	return left.length;
}

export async function purgeExpiredBin(now = Date.now()): Promise<number> {
	const old = await db.bin.filter((t) => binExpired(t.updated, now)).toArray();
	for (const t of old) await eraseFromBin(t.id);
	return old.length;
}
