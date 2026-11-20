// Shopping (6 Nov 2026, task "option courses dans l'app"): tick 🛒 when you add or edit a task and
// it becomes a shopping item. It gets the "shopping" label, skips the Inbox (no project or
// validation needed: it goes to a "Shopping" project, unless it already has a project of its own),
// and is listed on the Shopping page, grouped by shop (its other labels: biocoop, decathlon…). It
// stays out of the home page blocks and the reviews' lists.
import { db } from '../db/schema';
import { createTask, addTaskLabel, removeTaskLabel, moveTaskToProject, ensureHiddenLabel, validateTask } from './tasks';
import { createProject } from './projects';
import { VALIDATED_LABEL } from '../utils/context';
import { isInboxProject } from '../utils/context';
import { recorded } from '../stores/history.svelte';

export const SHOPPING_LABEL = 'shopping';
export const SHOPPING_PROJECT = 'Shopping';

export const isShopping = (t: { labels?: { title: string }[] }) => (t.labels ?? []).some((l) => l.title.trim().toLowerCase() === SHOPPING_LABEL);

async function shoppingLabelId(): Promise<number> {
	return ensureHiddenLabel(SHOPPING_LABEL, 'f2a93b');
}

/** The top-level "Shopping" project, created (Perso) the first time. */
export async function shoppingProjectId(): Promise<number> {
	const p = await db.projects.filter((x) => !x.parent_project_id && !x.is_archived && x.title.trim().toLowerCase() === SHOPPING_PROJECT.toLowerCase()).first();
	if (p) return p.id;
	return createProject({ title: SHOPPING_PROJECT, context: 'Perso' });
}

/** A new shopping item, straight on the list (not in the Inbox). */
export async function addShoppingItem(title: string, description?: string): Promise<number> {
	const [label, validated, project] = await Promise.all([shoppingLabelId(), ensureHiddenLabel(VALIDATED_LABEL, '4caf50'), shoppingProjectId()]);
	return createTask({ title, description, project_id: project, label_ids: [label, validated], start_date: new Date().toISOString(), due_date: null });
}

/** Ticks or unticks 🛒 on an existing task. Ticked from the Inbox, it leaves the Inbox. */
export async function setShopping(id: number, on: boolean): Promise<void> {
	await recorded(on ? 'Mark as shopping' : 'Not shopping any more', [id], async () => {
		const t = await db.tasks.get(id);
		if (!t) return;
		const label = await shoppingLabelId();
		if (!on) {
			if (isShopping(t)) await removeTaskLabel(id, label);
			return;
		}
		if (!isShopping(t)) await addTaskLabel(id, label);
		const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
		if (isInboxProject(t.project_id, projects)) await moveTaskToProject(id, await shoppingProjectId());
		await validateTask(id);
	});
}
