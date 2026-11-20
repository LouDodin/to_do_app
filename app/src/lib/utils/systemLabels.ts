// Labels the app and the PC's automations act on (14 Nov 2026: shown first in the menu, on a line
// of their own). Renaming or deleting one of them stops what it drives.
//   today        tomorrow's / today's list: Today on the home page; set by Tomorrow and the Weekly review
//   week         the week's list: This week on the home page, Upcoming's To schedule; set by the Weekly review
//   next-action  Available on the home page; passed along precedes/follows links by the PC
//   p1           Red on the home page, Next actions in the reviews
//   overdue      set by the PC from due dates; Red on the home page
//   last-day     set by the PC on the due day; Red on the home page
//   waiting-for  Waiting for in the Weekly review; left out of Tomorrow
//   shopping     the Shopping page (the cart in the New task box)
import type { VikunjaLabel } from '../types';

export const SYSTEM_LABELS = ['today', 'week', 'next-action', 'p1', 'overdue', 'last-day', 'waiting-for', 'shopping'];

const rank = (l: VikunjaLabel) => SYSTEM_LABELS.indexOf(l.title.trim().toLowerCase());

/** The labels split in two: those the app and the automations use (in the order above), the others. */
export function splitSystemLabels<T extends VikunjaLabel>(labels: T[]): { system: T[]; other: T[] } {
	const system = labels.filter((l) => rank(l) >= 0).sort((a, b) => rank(a) - rank(b) || a.id - b.id);
	return { system, other: labels.filter((l) => rank(l) < 0) };
}
