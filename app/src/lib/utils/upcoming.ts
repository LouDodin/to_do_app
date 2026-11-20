// The Upcoming page (13 Nov 2026, idea from Things, asked by Lou Canava): the coming days in a
// list, each with what is planned for it, so each day can be planned ahead. A task is planned for
// a day by its start date ("when": it shows on the home page from that day on, as in Things);
// a task due that day is listed under it too, marked "due". Pure functions, tested without a browser.
import type { VikunjaProject, VikunjaTask } from '../types';
import { hasDate } from './dates';
import { isTaskPending } from './context';
import { reviewable, inInboxView, WEEK_LABEL } from './reviews';

const DAY = 86_400_000;
export const dayStart = (d: Date, offset = 0): Date => {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	x.setDate(x.getDate() + offset);
	return x;
};
const ms = (iso?: string | null) => (hasDate(iso) ? new Date(iso).getTime() : NaN);
const has = (t: VikunjaTask, name: string) => (t.labels ?? []).some((l) => l.title.trim().toLowerCase() === name);

export interface UpcomingDay {
	date: Date;
	/** Starting that day (planned for it). */
	planned: VikunjaTask[];
	/** Due that day, not already planned for it. */
	due: VikunjaTask[];
}

export interface Upcoming {
	days: UpcomingDay[];
	/** On the week's list (label "week") but given no day yet. */
	toPlan: VikunjaTask[];
	/** Due before today, not done (13 Nov 2026: every task with a due date is on Upcoming). */
	overdue: VikunjaTask[];
}

// Every day of the next two months at least (13 Nov 2026), up to the last planned or due task.
export const MIN_DAYS = 61;
const MAX_DAYS = 366;

/** A task of the Inbox counts once a day was chosen for it (its start is not just its creation). */
function plannedInbox(t: VikunjaTask, first: number): boolean {
	const s = ms(t.start_date);
	return Number.isFinite(s) && s >= first && Math.abs(s - (ms(t.created) || 0)) > 120_000;
}

export function upcoming(tasks: VikunjaTask[], projects: VikunjaProject[], now = new Date(), minDays = MIN_DAYS): Upcoming {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const first = dayStart(now).getTime();
	const open = reviewable(tasks, projects).filter((t) => !t.done && !isTaskPending(t) && (!inInboxView(t, byId) || plannedInbox(t, first)));
	let lastAt = 0;
	for (const t of open) for (const v of [ms(t.start_date), ms(t.due_date)]) if (Number.isFinite(v) && v > lastAt) lastAt = v;
	const nDays = Math.min(MAX_DAYS, Math.max(minDays, Math.floor((lastAt - first + 2 * 3_600_000) / DAY) + 1));
	const days: UpcomingDay[] = Array.from({ length: nDays }, (_, i) => ({ date: dayStart(now, i), planned: [], due: [] }));
	const end = dayStart(now, nDays).getTime();
	// DST: a day can be 23 or 25 hours long, so a day is found by its bounds, not by a division.
	const starts = days.map((d) => d.date.getTime());
	const idx = (v: number) => {
		if (!Number.isFinite(v) || v < first || v >= end) return -1;
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= v) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};
	for (const t of open) {
		// A start date that is just the moment the task was made (the default) is not a plan: such a
		// task is not listed under that day (13 Nov 2026: Today was full of tasks added today).
		const si = Math.abs(ms(t.start_date) - (ms(t.created) || 0)) > 120_000 ? idx(ms(t.start_date)) : -1;
		const di = idx(ms(t.due_date));
		if (si >= 0) days[si].planned.push(t);
		if (di >= 0 && di !== si) days[di].due.push(t);
	}
	const byStart = (a: VikunjaTask, b: VikunjaTask) => ms(a.start_date) - ms(b.start_date) || a.id - b.id;
	for (const d of days) {
		d.planned.sort(byStart);
		d.due.sort((a, b) => ms(a.due_date) - ms(b.due_date));
	}
	const planned = new Set(days.flatMap((d) => d.planned.map((t) => t.id)));
	const overdue = open.filter((t) => Number.isFinite(ms(t.due_date)) && ms(t.due_date) < first).sort((a, b) => ms(a.due_date) - ms(b.due_date));
	return { days, toPlan: open.filter((t) => has(t, WEEK_LABEL) && !planned.has(t.id)), overdue };
}

/** The new start date when a task is planned for `day`: that day, at the time it had (09:00 if none). */
export function planFor(task: Pick<VikunjaTask, 'start_date'>, day: Date): string {
	const d = new Date(day);
	const s = ms(task.start_date);
	if (Number.isFinite(s)) {
		const old = new Date(s);
		d.setHours(old.getHours(), old.getMinutes(), 0, 0);
	} else d.setHours(9, 0, 0, 0);
	return d.toISOString();
}
