// The fixed jobs of the Weekly review (26 Oct 2026): things to do every week that are not tasks in
// any project, such as tidying the computer's Desktop and Downloads folders. Ticked once per week
// (Monday to Sunday); a new week starts unticked.

export const ROUTINE_ITEMS = [
	{ id: 'desktop', label: 'Desktop', hint: 'Delete, file away, or turn into a task (n).' },
	{ id: 'downloads', label: 'Downloads', hint: 'Delete what you no longer need, file the rest.' },
	// 11 Nov 2026
	{ id: 'emails', label: 'Emails', hint: 'Sort the mailbox: answer, file, delete; what needs doing becomes a task.' }
] as const;

export type RoutineId = (typeof ROUTINE_ITEMS)[number]['id'];
export interface RoutineState {
	week: string;
	done: string[];
}

/** ISO week of a date, in local time: "2026-W44". */
export function isoWeek(d: Date): string {
	const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const day = (t.getDay() + 6) % 7; // Monday = 0
	t.setDate(t.getDate() - day + 3); // the Thursday of this week decides the year
	const firstThursday = new Date(t.getFullYear(), 0, 4);
	const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
	return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** What is ticked this week: nothing if the stored ticks are from another week. */
export function doneThisWeek(stored: unknown, now = new Date()): string[] {
	if (!stored || typeof stored !== 'object') return [];
	const s = stored as Partial<RoutineState>;
	if (s.week !== isoWeek(now) || !Array.isArray(s.done)) return [];
	return s.done.filter((x): x is string => typeof x === 'string' && known(x));
}

/** Ticks or unticks one job, for this week. */
export function toggled(done: string[], id: string, now = new Date()): RoutineState {
	const set = new Set(done);
	if (set.has(id)) set.delete(id);
	else set.add(id);
	return { week: isoWeek(now), done: [...set].filter(known).sort() };
}

/** A fixed job, or a step of the review ticked by hand ("step-3", 11 Nov 2026; "step-clean", "step-review" since 13 Nov 2026). */
function known(id: string): boolean {
	return ROUTINE_ITEMS.some((i) => i.id === id) || /^step-[a-z0-9]{1,12}$/.test(id);
}
