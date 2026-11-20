// What was planned for each day, and what got done (5 Nov 2026, task "fonctionnalité résumé de ce
// qui est fait chaque jour + ce qui était planifié"). A task is "planned" for a day when it carried
// the "today" label at some point that day (chosen the evening before in Tomorrow's priorities, or
// during the day). The label is removed when a task is completed, so the app writes the plan down.
import type { VikunjaTask } from '../types';
import { isAbandoned } from './context';

export type Plans = Record<string, number[]>; // 'YYYY-MM-DD' -> task ids
export const KEEP_DAYS = 14;

export function dayKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const hasToday = (t: VikunjaTask) => (t.labels ?? []).some((l) => l.title.toLowerCase() === 'today');

export const nextDayKey = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
/** The keys of the last `n` days, today included. */
export const lastDays = (n: number, d = new Date()) => Array.from({ length: n }, (_, i) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));

/** The plans with today's "today" tasks added; old days dropped. Returns null when nothing changed.
 *  A task chosen in the evening for tomorrow (written under tomorrow, see stores/dayPlan) is not
 *  counted as planned for today (13 Nov 2026). */
export function notePlanned(plans: Plans, tasks: VikunjaTask[], now = new Date()): Plans | null {
	const key = dayKey(now);
	const before = new Set(plans[key] ?? []);
	const forTomorrow = new Set(plans[nextDayKey(now)] ?? []);
	const add = tasks.filter((t) => !t.done && t.id > 0 && hasToday(t) && !forTomorrow.has(t.id)).map((t) => t.id);
	const merged = [...new Set([...before, ...add])];
	const cutoff = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS));
	const kept = Object.fromEntries(Object.entries(plans).filter(([k]) => k > cutoff));
	const changed = merged.length !== before.size || Object.keys(kept).length !== Object.keys(plans).length;
	return changed ? { ...kept, [key]: merged } : null;
}

/** Two devices' plans together (a task planned on either counts). */
export function mergePlans(a: Plans, b: Plans): Plans {
	const out: Plans = { ...a };
	for (const [k, ids] of Object.entries(b)) out[k] = [...new Set([...(out[k] ?? []), ...ids])];
	return out;
}

const time = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export interface DaySummary {
	planned: { task: VikunjaTask; done: boolean }[];
	alsoDone: VikunjaTask[];
}

/** The day's summary: each planned task, done or not, and what was done without being planned. */
export function daySummary(plans: Plans, tasks: VikunjaTask[], day = new Date()): DaySummary {
	const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
	const end = start + 86_400_000;
	const doneThatDay = (t: VikunjaTask) => !!t.done && !isAbandoned(t) && time(t.done_at) >= start && time(t.done_at) < end;
	const ids = new Set(plans[dayKey(day)] ?? []);
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const planned = [...ids].map((id) => byId.get(id)).filter((t): t is VikunjaTask => !!t).map((task) => ({ task, done: doneThatDay(task) }));
	planned.sort((a, b) => Number(b.done) - Number(a.done));
	const alsoDone = tasks.filter((t) => doneThatDay(t) && !ids.has(t.id));
	return { planned, alsoDone };
}
