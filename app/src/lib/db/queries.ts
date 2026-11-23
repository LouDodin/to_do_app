import { db } from './schema';
import { compileFilter, makeResolver } from '../utils/filterEval';
import type { VikunjaTask, VikunjaProject } from '../types';
import { hasDate } from '../utils/dates';
import { taskContext, inView, inReview, REVIEW_LABEL, validatedMarkInUse, isTaskPending, isOngoing } from '../utils/context';
import { isBinProject } from '../utils/bin';
import { movedOutOfInbox } from '../stores/inboxGuard';

// Vikunja gives every instance a default "Inbox" project (conventionally id
// 1). We resolve by title too, so a renamed/self-hosted setup still works.
export async function getInboxProject(): Promise<VikunjaProject | undefined> {
	const byTitle = await db.projects.filter((p) => p.title.toLowerCase() === 'inbox').first();
	if (byTitle) return byTitle;
	return db.projects.get(1);
}

// "Pro"/"Perso" are the two top-level life-area projects the whole tree
// hangs off (see spec "Architecture des projets"). We resolve them by
// title, matching what the user set up in Vikunja directly.
export async function getTopLevelAreaProject(title: 'Pro' | 'Perso'): Promise<VikunjaProject | undefined> {
	return db.projects.filter((p) => p.title.toLowerCase() === title.toLowerCase() && !p.parent_project_id).first();
}

export async function descendantProjectIds(rootId: number): Promise<Set<number>> {
	const all = await db.projects.toArray();
	const ids = new Set<number>([rootId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const p of all) {
			if (p.parent_project_id && ids.has(p.parent_project_id) && !ids.has(p.id)) {
				ids.add(p.id);
				changed = true;
			}
		}
	}
	return ids;
}

// Tasks belonging to an "area" (Pro or Perso) and all of its nested
// sub-projects, excluding the Inbox itself — used to drive Bloc 1's
// Pro/Perso toggle (spec: "filtre à la fois le menu de projets ... et les
// blocs 2, 3, 4").
export async function tasksInArea(areaTitle: 'Pro' | 'Perso'): Promise<VikunjaTask[]> {
	const area = await getTopLevelAreaProject(areaTitle);
	if (!area) return [];
	const ids = await descendantProjectIds(area.id);
	// Completed tasks are included here too — TaskList itself owns the
	// show/hide-completed toggle, so callers hand it the full pool.
	return db.tasks.filter((t) => ids.has(t.project_id)).toArray();
}

export async function getLabelIdByTitle(title: string): Promise<number | undefined> {
	const label = await db.labels.filter((l) => l.title.toLowerCase() === title.toLowerCase()).first();
	return label?.id;
}

export async function tasksWithLabelTitle(labelTitle: string, within?: VikunjaTask[]): Promise<VikunjaTask[]> {
	const pool = within ?? (await db.tasks.filter((t) => !t.done).toArray());
	return pool.filter((t) => t.labels?.some((l) => l.title.toLowerCase() === labelTitle.toLowerCase()));
}

export async function tasksMatchingSavedFilterTitle(
	filterTitle: string,
	within?: VikunjaTask[]
): Promise<VikunjaTask[]> {
	const filter = await db.filters.filter((f) => f.title.toLowerCase() === filterTitle.toLowerCase()).first();
	if (!filter) return [];
	const pool = within ?? (await db.tasks.filter((t) => !t.done).toArray());
	const predicate = compileFilter(
		filter.filters.filter,
		makeResolver(await db.labels.toArray(), await db.projects.toArray())
	);
	return pool.filter(predicate);
}

function excludeIds(tasks: VikunjaTask[], excluded: VikunjaTask[][]): VikunjaTask[] {
	const excludedIds = new Set(excluded.flat().map((t) => t.id));
	return tasks.filter((t) => !excludedIds.has(t.id));
}

// The home page's four blocks, per spec:
//   Bloc 1: Pro/Perso toggle (scopes the pool for blocks 2-4, and the left project menu)
//   Bloc 2: label "today"
//   Bloc 3: saved filter "Red", minus Bloc 2
//   Bloc 4: saved filter "Available", minus Bloc 2 and Bloc 3
// Inbox tasks are excluded throughout (spec: "n'apparaissent nulle part ailleurs").
// Weekly review page: active projects with open tasks but no `next-action`
// label anywhere among them — the things at risk of silently stalling.
export async function getProjectsWithoutNextAction(): Promise<VikunjaProject[]> {
	const inbox = await getInboxProject();
	const projects = await db.projects.filter((p) => !p.is_pending && p.id !== inbox?.id).toArray();
	const allOpenTasks = await db.tasks.filter((t) => !t.done).toArray();
	const out: VikunjaProject[] = [];
	for (const p of projects) {
		const tasksHere = allOpenTasks.filter((t) => t.project_id === p.id);
		if (tasksHere.length === 0) continue;
		const hasNextAction = tasksHere.some((t) => t.labels?.some((l) => l.title.toLowerCase() === 'next-action'));
		if (!hasNextAction) out.push(p);
	}
	return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getPendingProjects(): Promise<VikunjaProject[]> {
	return db.projects.filter((p) => !!p.is_pending).sortBy('title');
}

// Daily review page ("priorisation du lendemain"): tasks matching the
// saved `tomorrow` filter, so the user can tag today's picks for tomorrow.
export async function getTomorrowCandidates(): Promise<VikunjaTask[]> {
	return (await tasksMatchingSavedFilterTitle('tomorrow')).filter((t) => !isTaskPending(t));
}

// Same page also needs today's `today`-labeled tasks, so the user can
// decide whether to carry them over or drop the label. Completed ones are
// included too — TaskList's own toggle hides them by default.
export async function getTodayNotDone(): Promise<VikunjaTask[]> {
	const pool = await db.tasks.toArray();
	return tasksWithLabelTitle('today', pool);
}

// The home page's blocks are defined here, by label NAME (never by id), so
// they keep working when labels are merged or recreated. A task lands in
// exactly one block: Today, else Red, else Available, else All.
export const HOME_LABELS = {
	today: ['today'],
	// The week's list, chosen in the Weekly review (13 Nov 2026): a block of its own, under Today.
	week: ['week'],
	red: ['overdue', 'last-day', 'p1'],
	available: ['next-action']
};

export function hasLabelNamed(task: VikunjaTask, names: string[]): boolean {
	return (task.labels ?? []).some((l) => names.includes(l.title.trim().toLowerCase()));
}

// "SINGLE TASKS PERSO", "SINGLE TASKS PRO"…: projects of one-off tasks. Each of them is its own
// next step, so it counts as available without a next-action label (26 Oct 2026), unless it is
// waiting for someone.
export const isSingleTasksProject = (p?: { title: string }) => !!p && /^single tasks\b/i.test(p.title.trim());

export function partitionHomeBlocks(pool: VikunjaTask[], singleProjects: Set<number> = new Set()): {
	today: VikunjaTask[];
	week: VikunjaTask[];
	red: VikunjaTask[];
	available: VikunjaTask[];
	all: VikunjaTask[];
} {
	const today: VikunjaTask[] = [];
	const week: VikunjaTask[] = [];
	const red: VikunjaTask[] = [];
	const available: VikunjaTask[] = [];
	const all: VikunjaTask[] = [];
	for (const t of pool) {
		if (hasLabelNamed(t, HOME_LABELS.today)) today.push(t);
		else if (hasLabelNamed(t, HOME_LABELS.week) && !hasLabelNamed(t, ['shopping'])) week.push(t);
		else if (hasLabelNamed(t, HOME_LABELS.red)) red.push(t);
		else if (hasLabelNamed(t, ['shopping'])) continue; // on the Shopping page (6 Nov 2026)
		else if (hasLabelNamed(t, HOME_LABELS.available)) available.push(t);
		else if (singleProjects.has(t.project_id) && !hasLabelNamed(t, ['waiting-for'])) available.push(t);
		else all.push(t);
	}
	return { today, week, red, available, all };
}

export async function getProjectMap(): Promise<Map<number, VikunjaProject>> {
	return new Map((await db.projects.toArray()).map((p) => [p.id, p]));
}

// Splits tasks into Pro / Perso / Unsorted (in that order, empty groups left out).
export async function groupByContext(
	tasks: VikunjaTask[]
): Promise<{ title: string; tasks: VikunjaTask[] }[]> {
	const byId = await getProjectMap();
	const groups: Record<string, VikunjaTask[]> = { Pro: [], Perso: [], Unsorted: [] };
	for (const t of tasks) groups[taskContext(t, byId) ?? 'Unsorted'].push(t);
	return Object.entries(groups)
		.filter(([, list]) => list.length > 0)
		.map(([title, list]) => ({ title, tasks: list }));
}

// Tasks visible in a given view: Input = no context yet, All = Pro + Perso.
export async function tasksInView(view: 'input' | 'all' | 'Pro' | 'Perso'): Promise<VikunjaTask[]> {
	const byId = await getProjectMap();
	// Moved out of the Inbox project on this device and not validated: stays in the Inbox view
	// even if its "to validate" flag was lost (stores/inboxGuard.ts), and gets the flag back.
	// (Only needed before the one-time marking: after it, a lost mark brings a task back by itself.)
	const moved = validatedMarkInUse() ? new Set<number>() : movedOutOfInbox();
	const lost = (t: VikunjaTask) => moved.has(t.id) && !t.done && !inReview(t) && !isBinTask(t, byId);
	const tasks = await db.tasks.filter((t) => (lost(t) ? view === 'input' : inView(t, byId, view))).toArray();
	// (out of this read-only query: written just after)
	if (view === 'input') for (const t of tasks) if (lost(t)) setTimeout(() => void reflag(t.id), 0);
	return tasks;
}

const reflagging = new Set<number>();
async function reflag(id: number) {
	if (reflagging.has(id)) return;
	reflagging.add(id);
	try {
		const { setTaskLabels, ensureHiddenLabel } = await import('../actions/tasks');
		const t = await db.tasks.get(id);
		if (t && !inReview(t)) await setTaskLabels(id, [...(t.labels ?? []).map((l) => l.id), await ensureHiddenLabel(REVIEW_LABEL, 'ffd152')]);
	} finally {
		setTimeout(() => reflagging.delete(id), 30_000);
	}
}

function isBinTask(t: VikunjaTask, byId: Map<number, VikunjaProject>): boolean {
	const p = byId.get(t.project_id);
	return !!p && isBinProject(p);
}

// Since 19 Oct 2026 the home page's last block is "My filter" (built by you, see
// utils/selfFilter.ts) instead of "All": with no criterion it lists `all` (the tasks of no other
// block), with criteria it searches the whole `pool`.
export async function getHomeBlocks(area: 'input' | 'all' | 'Pro' | 'Perso', separateOngoing = true): Promise<{
	ongoing: VikunjaTask[];
	today: VikunjaTask[];
	week: VikunjaTask[];
	red: VikunjaTask[];
	available: VikunjaTask[];
	all: VikunjaTask[];
	pool: VikunjaTask[];
	unsorted: VikunjaTask[];
}> {
	const basePool = await tasksInView(area);
	// The Input view is a plain "to sort" list, with no blocks and no date rules.
	if (area === 'input') {
		return { ongoing: [], today: [], week: [], red: [], available: [], all: [], pool: [], unsorted: basePool };
	}
	// Tasks that haven't started yet are listed in their project but never
	// on the home page, in any block. Completed ones aren't hidden: a task
	// done early still belongs in the "show completed" list.
	const now = Date.now();
	// Pending tasks (on hold) aren't on the home page either, until resumed (10 Nov 2026).
	const pool = basePool.filter((t) => t.done || (!isTaskPending(t) && (!hasDate(t.start_date) || new Date(t.start_date).getTime() <= now)));

	const single = new Set((await db.projects.toArray()).filter((p) => isSingleTasksProject(p)).map((p) => p.id));
	// Ongoing tasks have their own block, first (20 Nov 2026, Lou #582), and no other.
	const ongoing = separateOngoing ? pool.filter((t) => !t.done && isOngoing(t)) : [];
	const ongoingIds = new Set(ongoing.map((t) => t.id));
	const { today, week, red, available, all } = partitionHomeBlocks(pool.filter((t) => !ongoingIds.has(t.id)), single);

	return { ongoing, today, week, red, available, all, pool, unsorted: [] };
}
