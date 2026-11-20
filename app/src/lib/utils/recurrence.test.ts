import { describe, it, expect } from 'vitest';
import { repeatKind, repeatFields, nextDue, nextWeekdayAt } from './recurrence';

describe('recurrence', () => {
	it('maps kinds to Vikunja fields and back', () => {
		for (const k of ['day', 'week', 'month', 'year'] as const) expect(repeatKind(repeatFields(k))).toBe(k);
		expect(repeatKind({})).toBe('none');
	});
	it('keeps the wall-clock time across a week (daylight saving)', () => {
		const due = new Date(2026, 9, 19, 9, 0); // Monday 19 Oct 09:00
		const n = nextDue(due, 'week', new Date(2026, 9, 20));
		expect([n.getFullYear(), n.getMonth(), n.getDate(), n.getHours()]).toEqual([2026, 9, 26, 9]);
		const across = nextDue(new Date(2026, 9, 26, 9, 0), 'week', new Date(2026, 9, 27));
		expect(across.getHours()).toBe(9);
	});
	it('skips missed occurrences', () => {
		const n = nextDue(new Date(2026, 0, 5, 9, 0), 'week', new Date(2026, 9, 9));
		expect(n.getDay()).toBe(1);
		expect(n.getTime()).toBeGreaterThan(new Date(2026, 9, 9).getTime());
	});
	it('repeats yearly on the same date, leap days clamp', () => {
		const n = nextDue(new Date(2027, 2, 14, 12), 'year', new Date(2027, 2, 15));
		expect([n.getFullYear(), n.getMonth(), n.getDate()]).toEqual([2028, 2, 14]);
		const leap = nextDue(new Date(2028, 1, 29, 12), 'year', new Date(2028, 2, 1));
		expect([leap.getFullYear(), leap.getMonth(), leap.getDate()]).toEqual([2029, 1, 28]);
	});
	it('monthly clamps to the end of short months', () => {
		const n = nextDue(new Date(2026, 0, 31, 8), 'month', new Date(2026, 0, 31, 9));
		expect([n.getMonth(), n.getDate()]).toEqual([1, 28]);
	});
	it('finds the next Monday at 9', () => {
		const n = nextWeekdayAt(1, 9, 0, new Date(2026, 9, 9, 10)); // Friday 9 Oct
		expect([n.getMonth(), n.getDate(), n.getHours()]).toEqual([9, 12, 9]);
		const same = nextWeekdayAt(5, 9, 0, new Date(2026, 9, 9, 10)); // Friday, 9:00 already passed
		expect(same.getDate()).toBe(16);
	});
});
