// Repeating tasks. The due date carries the "when" (weekday + time, or day + month), so a
// repeat is only a kind: every week, every month or every year. Completing a repeating task
// moves it to its next due date instead of closing it (done on the calendar, so daylight
// saving and leap years never shift the time or the date).
import type { VikunjaTask } from '../types';

export type RepeatKind = 'none' | 'day' | 'week' | 'month' | 'year';

export const WEEK_SECONDS = 7 * 86400;
export const YEAR_SECONDS = 365 * 86400;

export function repeatKind(t: Pick<VikunjaTask, 'repeat_after' | 'repeat_mode'>): RepeatKind {
	if (t.repeat_mode === 1) return 'month';
	const s = t.repeat_after ?? 0;
	if (s <= 0) return 'none';
	if (s === YEAR_SECONDS) return 'year';
	if (s % WEEK_SECONDS === 0) return 'week';
	if (s % 86400 === 0) return 'day';
	return 'day';
}

export function repeatFields(kind: RepeatKind): { repeat_after: number; repeat_mode: number } {
	switch (kind) {
		case 'day':
			return { repeat_after: 86400, repeat_mode: 0 };
		case 'week':
			return { repeat_after: WEEK_SECONDS, repeat_mode: 0 };
		case 'month':
			return { repeat_after: 0, repeat_mode: 1 };
		case 'year':
			return { repeat_after: YEAR_SECONDS, repeat_mode: 0 };
		default:
			return { repeat_after: 0, repeat_mode: 0 };
	}
}

function addOne(d: Date, kind: RepeatKind, days = 1): Date {
	const r = new Date(d);
	if (kind === 'day') r.setDate(r.getDate() + days);
	else if (kind === 'week') r.setDate(r.getDate() + 7);
	else if (kind === 'month' || kind === 'year') {
		const day = r.getDate();
		const months = kind === 'month' ? 1 : 12;
		r.setDate(1);
		r.setMonth(r.getMonth() + months);
		const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
		r.setDate(Math.min(day, last));
	}
	return r;
}

// First occurrence strictly after `now` (missed ones are skipped, never piled up).
export function nextDue(due: Date, kind: RepeatKind, now = new Date(), days = 1): Date {
	if (kind === 'none') return due;
	let next = addOne(due, kind, days);
	let guard = 0;
	while (next.getTime() <= now.getTime() && guard++ < 5000) next = addOne(next, kind, days);
	return next;
}

// Next occurrence of a weekday (0 = Sunday) at hh:mm, after `now`.
export function nextWeekdayAt(weekday: number, hour: number, minute: number, now = new Date()): Date {
	const d = new Date(now);
	d.setHours(hour, minute, 0, 0);
	let add = (weekday - d.getDay() + 7) % 7;
	d.setDate(d.getDate() + add);
	if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
	return d;
}
