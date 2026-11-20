// Merging duplicate labels, projects and saved filters.
//
// These are destructive, so every merge follows the same rule: move things
// first, send the changes to the server, then read the server's own data back
// and only delete the duplicate if nothing still points at it. If anything is
// off, the duplicate is left in place and the reason is returned.
import { db } from '../db/schema';
import { flushQueue, queueWrite } from '../db/sync';
import { api } from '../api/client';
import { tasksApi, projectsApi } from '../api/endpoints';
import { moveTaskToProject, setTaskLabels } from './tasks';
import { binTask } from './bin';
import { descendantProjectIds } from '../db/queries';
import { moveProject, deleteProject, setProjectType } from './projects';
import { getInboxProject } from '../db/queries';
import type { Context } from '../utils/context';
import { deleteLabel } from './labels';
import { updateFilter, deleteFilter } from './filters';
import { remapFilterIds, type DuplicateGroup } from '../utils/dedupe';
import type { VikunjaLabel, VikunjaProject, VikunjaFilter } from '../types';

export interface MergeResult {
	ok: boolean;
	message: string;
}

// Whole-database operations must never run on a device that has not finished its
// first download (they would work on a partial copy of the data).
export async function firstSyncDone(): Promise<boolean> {
	return !!(await db.meta.get('lastPull'))?.value;
}
export const NOT_SYNCED_YET = 'This device has not finished its first sync yet: wait until the dot at the top turns green, then try again.';

// When the server last refused a change (0: never). A later value means a new refusal.
async function lastRefusal(): Promise<number> {
	return (((await db.meta.get('failedWrites'))?.value as { at: number }[] | undefined) ?? [])[0]?.at ?? 0;
}

async function onlineAndFlushed(): Promise<string | null> {
	if (!(await firstSyncDone())) return NOT_SYNCED_YET;
	if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You are offline: merging needs the server.';
	await flushQueue();
	const pending = await db.queue.count();
	if (pending > 0) return `${pending} changes are still waiting to sync. Try again once the sync indicator is idle.`;
	return null;
}

export async function mergeLabelGroup(group: DuplicateGroup<VikunjaLabel>): Promise<MergeResult> {
	const stop = await onlineAndFlushed();
	if (stop) return { ok: false, message: stop };
	const removeIds = new Set(group.remove.map((l) => l.id));
	const keepId = group.keep.id;

	const tasks = await db.tasks.filter((t) => !!t.labels?.some((l) => removeIds.has(l.id))).toArray();
	for (const t of tasks) {
		const ids = [...new Set((t.labels ?? []).map((l) => (removeIds.has(l.id) ? keepId : l.id)))];
		await setTaskLabels(t.id, ids);
	}
	await flushQueue();

	// Check the server's own copy of the tasks.
	const serverTasks = await tasksApi.allSince();
	const still = serverTasks.filter((t) => t.labels?.some((l) => removeIds.has(l.id)));
	if (still.length) return { ok: false, message: `${still.length} tasks still use a duplicate of "${group.keep.title}" on the server. Nothing was deleted.` };

	// Saved filters that mention the removed ids now point at the kept label.
	const map = new Map([...removeIds].map((id) => [id, keepId] as const));
	for (const f of await db.filters.toArray()) {
		const next = remapFilterIds(f.filters.filter, 'labels', map);
		if (next.trim() !== f.filters.filter.trim()) await updateFilter(f.id, f.title, next);
	}
	await flushQueue();

	for (const l of group.remove) await deleteLabel(l.id);
	await flushQueue();
	return { ok: true, message: `Merged ${group.remove.length} duplicate(s) of "${group.keep.title}".` };
}

export async function mergeProjectGroup(group: DuplicateGroup<VikunjaProject>): Promise<MergeResult> {
	const stop = await onlineAndFlushed();
	if (stop) return { ok: false, message: stop };
	const removeIds = new Set(group.remove.map((p) => p.id));
	const keepId = group.keep.id;

	for (const p of group.remove) {
		for (const t of await db.tasks.where('project_id').equals(p.id).toArray()) await moveTaskToProject(t.id, keepId);
		for (const c of await db.projects.filter((x) => x.parent_project_id === p.id).toArray()) await moveProject(c.id, keepId);
	}
	await flushQueue();

	const serverTasks = await tasksApi.allSince();
	const stuck = serverTasks.filter((t) => removeIds.has(t.project_id));
	if (stuck.length) return { ok: false, message: `${stuck.length} tasks are still in a duplicate of "${group.keep.title}" on the server. Nothing was deleted.` };
	const serverProjects = await projectsApi.all();
	const kids = serverProjects.filter((p) => p.parent_project_id && removeIds.has(p.parent_project_id));
	if (kids.length) return { ok: false, message: `${kids.length} sub-projects are still inside a duplicate of "${group.keep.title}". Nothing was deleted.` };

	for (const p of group.remove) await deleteProject(p.id);
	await flushQueue();
	return { ok: true, message: `Merged ${group.remove.length} duplicate(s) of "${group.keep.title}".` };
}

// Only called for filters with identical definitions.
export async function removeDuplicateFilters(group: DuplicateGroup<VikunjaFilter>): Promise<MergeResult> {
	for (const f of group.remove) await deleteFilter(f.id);
	await flushQueue();
	return { ok: true, message: `Removed ${group.remove.length} duplicate(s) of "${group.keep.title}".` };
}

// Pro and Perso as settings, not folders: the sub-projects of a top-level "Pro" / "Perso"
// folder move to the top level and keep that type as a setting, tasks sitting directly in the
// folder go to "no project" with their type, and the emptied folder is deleted - only after the
// server confirms nothing is left in it.
export async function convertContextFolders(): Promise<MergeResult> {
	const stop = await onlineAndFlushed();
	if (stop) return { ok: false, message: stop };
	const inbox = await getInboxProject();
	if (!inbox) return { ok: false, message: 'No Inbox project found, nothing was changed.' };
	const roots = await db.projects
		.filter((p) => !p.parent_project_id && !p.is_archived && ['pro', 'perso'].includes(p.title.trim().toLowerCase()))
		.toArray();
	if (!roots.length) return { ok: true, message: 'There are no Pro or Perso folders to convert.' };

	const done: string[] = [];
	for (const root of roots) {
		const ctx: Context = root.title.trim().toLowerCase() === 'pro' ? 'Pro' : 'Perso';
		for (const child of await db.projects.filter((p) => p.parent_project_id === root.id).toArray()) {
			await moveProject(child.id, undefined);
			await setProjectType(child.id, ctx);
		}
		for (const t of await db.tasks.where('project_id').equals(root.id).toArray()) {
			await moveTaskToProject(t.id, inbox.id);
		}
		await flushQueue();

		const serverTasks = await tasksApi.allSince();
		const serverProjects = await projectsApi.all();
		const leftTasks = serverTasks.filter((t) => t.project_id === root.id).length;
		const leftKids = serverProjects.filter((p) => p.parent_project_id === root.id).length;
		if (leftTasks || leftKids) {
			return { ok: false, message: `"${root.title}" still holds ${leftTasks} tasks and ${leftKids} sub-projects on the server. It was not deleted.` };
		}
		await deleteProject(root.id);
		await flushQueue();
		done.push(root.title);
	}
	return { ok: true, message: `${done.join(' and ')} are now settings instead of folders.` };
}

// Deleting a project (and its sub-projects): open tasks are not lost, they go back to the
// Inbox view with their Pro / Perso type kept; completed tasks go to the Bin (30 days).
// The project is only deleted once the server confirms no open task is left inside it.
export async function deleteProjectTree(rootId: number): Promise<MergeResult> {
	const root = await db.projects.get(rootId);
	if (!root) return { ok: false, message: 'This project no longer exists.' };
	const inbox = await getInboxProject();
	if (!inbox) return { ok: false, message: 'No Inbox project found, nothing was changed.' };
	const ids = await descendantProjectIds(rootId);
	if (ids.has(inbox.id)) return { ok: false, message: 'The Inbox cannot be deleted.' };
	const stop = await onlineAndFlushed();
	if (stop) return { ok: false, message: stop };

	const byId = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
	// 4 Nov 2026: Vikunja refuses to move a task out of an ARCHIVED project, and its task list leaves
	// out the tasks of archived projects. Deleting an archived project therefore deleted its open
	// tasks with it ("check cyto on Monday"). Archived projects of the tree are restored first.
	const archived = [...ids].filter((id) => byId.get(id)?.is_archived);
	for (const id of archived) {
		await db.projects.update(id, { is_archived: false });
		await queueWrite({ entity: 'project', op: 'update', targetId: id, payload: { is_archived: false } });
	}
	if (archived.length) {
		await flushQueue();
		if (await db.queue.count()) return { ok: false, message: `"${root.title}" could not be taken out of the archive first. Nothing was deleted.` };
	}
	// Every task the server has in these projects (some may never have reached this device),
	// plus those only known here.
	const local = await db.tasks.filter((t) => ids.has(t.project_id)).toArray();
	const fromServer = (await tasksApi.allSince()).filter((t) => ids.has(t.project_id));
	const known = new Set(local.map((t) => t.id));
	for (const t of fromServer) if (!known.has(t.id)) await db.tasks.put(t);
	const tasks = [...local, ...fromServer.filter((t) => !known.has(t.id))];
	const refusedBefore = await lastRefusal();
	let kept = 0;
	let removed = 0;
	for (const t of tasks) {
		if (t.done) {
			await binTask(t.id);
			removed++;
		} else {
			await moveTaskToProject(t.id, inbox.id);
			kept++;
		}
	}
	await flushQueue();
	if ((await lastRefusal()) > refusedBefore || (await db.queue.count()) > 0)
		return { ok: false, message: `Some tasks of "${root.title}" could not be moved out (see Help > Status). Nothing was deleted.` };

	const serverTasks = await tasksApi.allSince();
	const stuck = serverTasks.filter((t) => ids.has(t.project_id));
	if (stuck.length) return { ok: false, message: `${stuck.length} tasks are still in "${root.title}" on the server. Nothing was deleted.` };
	// And each moved task, one by one, really is out (never trust a list alone before deleting).
	for (const t of tasks) {
		try {
			const fresh = await api.get<{ project_id: number }>(`/api/v1/tasks/${t.id}`);
			if (ids.has(fresh.project_id)) return { ok: false, message: `"${t.title}" is still in "${root.title}" on the server. Nothing was deleted.` };
		} catch {
			return { ok: false, message: `Could not check "${t.title}" on the server. Nothing was deleted.` };
		}
	}

	// Deepest first, so no project is deleted while it still has children.
	const depth = (id: number) => { let d = 0; let p = byId.get(id); while (p?.parent_project_id && d < 30) { d++; p = byId.get(p.parent_project_id); } return d; };
	for (const id of [...ids].sort((a, b) => depth(b) - depth(a))) await deleteProject(id);
	await flushQueue();
	return { ok: true, message: `"${root.title}" deleted. ${kept} open task${kept === 1 ? '' : 's'} back in the Inbox, ${removed} completed in the Bin for 30 days.` };
}
