import { describe, it, expect } from 'vitest';
import { isoWeek, doneThisWeek, toggled } from './weeklyRoutine';

describe('weekly routine', () => {
	it('numbers weeks the ISO way', () => {
		expect(isoWeek(new Date(2026, 9, 26))).toBe('2026-W44'); // Monday 26 Oct 2026
		expect(isoWeek(new Date(2026, 10, 1))).toBe('2026-W44'); // Sunday 1 Nov
		expect(isoWeek(new Date(2026, 10, 2))).toBe('2026-W45'); // next Monday
		expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53'); // Friday 1 Jan 2027
		expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01');
	});
	it('keeps ticks for the current week only', () => {
		const now = new Date(2026, 9, 28);
		expect(doneThisWeek({ week: '2026-W44', done: ['desktop'] }, now)).toEqual(['desktop']);
		expect(doneThisWeek({ week: '2026-W43', done: ['desktop'] }, now)).toEqual([]);
		expect(doneThisWeek({ week: '2026-W44', done: ['nope', 3] }, now)).toEqual([]);
		expect(doneThisWeek(null, now)).toEqual([]);
	});
	it('ticks and unticks', () => {
		const now = new Date(2026, 9, 28);
		const a = toggled([], 'downloads', now);
		expect(a).toEqual({ week: '2026-W44', done: ['downloads'] });
		expect(toggled(['downloads', 'desktop'], 'downloads', now).done).toEqual(['desktop']);
	});
	it('keeps the steps ticked by hand, for the week', () => {
		const now = new Date(2026, 10, 11);
		const a = toggled(['desktop'], 'step-3', now);
		expect(a.done).toEqual(['desktop', 'step-3']);
		expect(doneThisWeek(a, now)).toEqual(['desktop', 'step-3']);
		expect(doneThisWeek({ week: a.week, done: ['step-clean', 'step-Bad!', 'other'] }, now)).toEqual(['step-clean']);
		expect(toggled(a.done, 'step-3', now).done).toEqual(['desktop']);
	});
});
