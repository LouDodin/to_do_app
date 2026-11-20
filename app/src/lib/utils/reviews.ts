// The content of the two review pages (Tomorrow's priorities, Weekly review), as pure functions
// of the tasks and projects, so it can be tested without a browser.
import type { VikunjaProject, VikunjaTask } from '../types';
import { hasDate } from './dates';
import { inReview, isInboxProject, isTaskPending, isAbandoned } from './context';
import { isBinProject } from './bin';

const DAY = 86_400_000;
const has = (t: VikunjaTask, name: string) => (t.labels ?? []).some((l) => l.title.trim().toLowerCase() === name);
const time = (iso?: string | null) => (hasDate(iso) ? new Date(iso).getTime() : NaN);
const startOfDay = (now: Date, offset = 0) => {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return d.getTime();
};
const byDue = (a: VikunjaTask, b: VikunjaTask) => time(a.due_date) - time(b.due_date);

/** Tasks that count in a review: not in the Bin, not in an archived project. */
export function reviewable(tasks: VikunjaTask[], projects: VikunjaProject[]): VikunjaTask[] {
	const hidden = new Set<number>();
	const byParent = new Map<number, VikunjaProject[]>();
	for (const p of projects) {
		const k = p.parent_project_id ?? 0;
		byParent.set(k, [...(byParent.get(k) ?? []), p]);
	}
	const hide = (p: VikunjaProject) => {
		if (hidden.has(p.id)) return;
		hidden.add(p.id);
		for (const c of byParent.get(p.id) ?? []) hide(c);
	};
	for (const p of projects) if (isBinProject(p) || p.is_archived) hide(p);
	return tasks.filter((t) => !hidden.has(t.project_id));
}

/** Waiting in the Inbox view: not validated yet, or still in the Inbox project. */
export function inInboxView(t: VikunjaTask, byId: Map<number, VikunjaProject>): boolean {
	return inReview(t) || isInboxProject(t.project_id, byId);
}

export interface TomorrowReview {
	/** Open tasks labelled "today": the list for tomorrow (what is left from today stays on it). */
	chosen: VikunjaTask[];
	/** Done since midnight. */
	doneToday: VikunjaTask[];
	/** Open, due by the end of tomorrow (overdue included), not chosen yet. */
	dueSoon: VikunjaTask[];
}

export function tomorrowReview(tasks: VikunjaTask[], projects: VikunjaProject[], now = new Date()): TomorrowReview {
	const byId = new Map(projects.map((p) => [p.id, p]));
	// Pending (on hold) tasks never show here, whatever their labels or dates (13 Nov 2026).
	const pool = reviewable(tasks, projects).filter((t) => !inInboxView(t, byId) && (t.done || !isTaskPending(t)));
	const midnight = startOfDay(now);
	const endTomorrow = startOfDay(now, 2);
	const open = pool.filter((t) => !t.done);
	return {
		chosen: open.filter((t) => has(t, 'today')),
		doneToday: pool.filter((t) => t.done && !isAbandoned(t) && time(t.done_at) >= midnight),
		dueSoon: open.filter((t) => !has(t, 'today') && time(t.due_date) < endTomorrow).sort(byDue)
	};
}

/** Open tasks that were on a day's list (utils/dayPlan.ts) or on the week's list (`ids`), and are
 *  still to do: not done, not on hold, not back in the Inbox, not in the Bin (13 Nov 2026). */
export function plannedNotDone(tasks: VikunjaTask[], projects: VikunjaProject[], ids: Set<number>): VikunjaTask[] {
	const byId = new Map(projects.map((p) => [p.id, p]));
	return reviewable(tasks, projects)
		.filter((t) => !t.done && ids.has(t.id) && !isTaskPending(t) && !inInboxView(t, byId))
		.sort((a, b) => (time(a.due_date) || Infinity) - (time(b.due_date) || Infinity));
}

export interface WeeklyReview {
	inbox: VikunjaTask[];
	overdue: VikunjaTask[];
	/** Due in the next 7 days (from tomorrow on). */
	nextWeek: VikunjaTask[];
	waiting: VikunjaTask[];
	/** On hold (10 Nov 2026): time to resume one? */
	pending: VikunjaTask[];
	/** Open, not changed for 60 days: still worth doing? */
	untouched: VikunjaTask[];
	doneWeek: VikunjaTask[];
	createdWeek: number;
}

export const UNTOUCHED_DAYS = 60;

export function weeklyReview(tasks: VikunjaTask[], projects: VikunjaProject[], now = new Date()): WeeklyReview {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const pool = reviewable(tasks, projects);
	const open = pool.filter((t) => !t.done);
	const sortedAll = open.filter((t) => !inInboxView(t, byId));
	// Pending (on hold) tasks only show in their own step (13 Nov 2026).
	const sorted = sortedAll.filter((t) => !isTaskPending(t));
	const t0 = now.getTime();
	const tomorrow = startOfDay(now, 1);
	const weekAgo = t0 - 7 * DAY;
	return {
		inbox: open.filter((t) => inInboxView(t, byId)).sort((a, b) => (time(b.created) || 0) - (time(a.created) || 0)),
		overdue: sorted.filter((t) => time(t.due_date) < t0).sort(byDue),
		nextWeek: sorted.filter((t) => time(t.due_date) >= t0 && time(t.due_date) < tomorrow + 7 * DAY).sort(byDue),
		waiting: sorted.filter((t) => has(t, 'waiting-for')),
		pending: sortedAll.filter((t) => isTaskPending(t)),
		untouched: sorted
			.filter((t) => !has(t, 'shopping')) // a shopping item waits for the next trip to the shop
			.filter((t) => {
				const u = time(t.updated) || time(t.created);
				return Number.isFinite(u) && t0 - u > UNTOUCHED_DAYS * DAY;
			})
			.sort((a, b) => (time(a.updated) || 0) - (time(b.updated) || 0)),
		doneWeek: pool.filter((t) => t.done && !isAbandoned(t) && time(t.done_at) >= weekAgo),
		createdWeek: pool.filter((t) => time(t.created) >= weekAgo).length
	};
}

// ------------------------------------------------------------------ candidates (13 Nov 2026)
// What could go on tomorrow's list, or on the week's list. Until 13 Nov 2026 the candidates of
// Tomorrow's priorities were the saved filter "Tomorrow": open tasks with a due date (and a start
// date by tomorrow) or a next-action label. That left out the week's list, the single tasks, p1
// tasks and anything just added. Now: every open task that is sorted (not in the Inbox), not on
// hold, not a shopping item, not waiting for someone, and started (or starting) in time, in one of
// these groups (a task is in the first one that fits), and the rest is left out.
export type CandidateGroup = 'This week' | 'Next actions' | 'Due soon' | 'Due later' | 'Recently added';
export const CANDIDATE_GROUPS: CandidateGroup[] = ['This week', 'Next actions', 'Due soon', 'Due later', 'Recently added'];
export const WEEK_LABEL = 'week';
const SOON_DAYS = 14;
const RECENT_DAYS = 14;

/** Projects the saved filters leave out ("project_id not in 8, 19, …"), if there are any. */
export function excludedProjectIds(filterText: string | undefined): Set<number> {
	const m = /project_id\s+not\s+in\s+([\d,\s]+)/i.exec(filterText ?? '');
	return new Set((m?.[1] ?? '').split(/[,\s]+/).filter(Boolean).map(Number));
}

export function candidates(
	tasks: VikunjaTask[],
	projects: VikunjaProject[],
	opts: { now?: Date; horizonDays?: number; skip?: Set<number>; excluded?: Set<number>; singleProjects?: Set<number>; withWeek?: boolean } = {}
): { group: CandidateGroup; tasks: VikunjaTask[] }[] {
	const now = opts.now ?? new Date();
	const horizon = startOfDay(now, 1 + (opts.horizonDays ?? 1));
	const t0 = now.getTime();
	const byId = new Map(projects.map((p) => [p.id, p]));
	const excluded = opts.excluded ?? new Set<number>();
	const single = opts.singleProjects ?? new Set<number>();
	const out = new Map<CandidateGroup, VikunjaTask[]>(CANDIDATE_GROUPS.map((g) => [g, []]));
	for (const t of reviewable(tasks, projects)) {
		if (t.done || inInboxView(t, byId) || isTaskPending(t) || excluded.has(t.project_id) || opts.skip?.has(t.id)) continue;
		if (has(t, 'shopping') || has(t, 'waiting-for')) continue;
		const start = time(t.start_date);
		if (Number.isFinite(start) && start >= horizon) continue; // not started by then
		const due = time(t.due_date);
		let g: CandidateGroup | null = null;
		if (has(t, WEEK_LABEL)) g = opts.withWeek === false ? null : 'This week';
		else if (has(t, 'next-action') || has(t, 'p1') || single.has(t.project_id)) g = 'Next actions';
		else if (Number.isFinite(due) && due < t0 + SOON_DAYS * DAY) g = 'Due soon';
		else if (Number.isFinite(due)) g = 'Due later';
		else if (time(t.created) >= t0 - RECENT_DAYS * DAY) g = 'Recently added';
		if (g) out.get(g)!.push(t);
	}
	for (const [g, list] of out) list.sort(g === 'Recently added' ? (a, b) => (time(b.created) || 0) - (time(a.created) || 0) : (a, b) => (time(a.due_date) || Infinity) - (time(b.due_date) || Infinity));
	return CANDIDATE_GROUPS.map((g) => ({ group: g, tasks: out.get(g)! })).filter((x) => x.tasks.length);
}
