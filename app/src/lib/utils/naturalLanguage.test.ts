import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from './naturalLanguage';

const days = (d: Date | null) => {
	const a = new Date(); a.setHours(0, 0, 0, 0);
	const b = new Date(d!); b.setHours(0, 0, 0, 0);
	return Math.round((b.getTime() - a.getTime()) / 86400000);
};

describe('quick-add parsing', () => {
	it('keeps the title and reads project, labels, dates', () => {
		const r = parseQuickAdd('Call the bank #Admin @phone !tomorrow');
		expect(r.title).toBe('Call the bank');
		expect(r.projectQuery).toBe('Admin');
		expect(r.labelQueries).toEqual(['phone']);
		expect(days(r.dueDate)).toBe(1);
	});
	it('understands multi-word relative dates (French and English)', () => {
		expect(days(parseQuickAdd('Pay rent !dans 3 jours').dueDate)).toBe(3);
		expect(days(parseQuickAdd('Pay rent !in 3 days').dueDate)).toBe(3);
		expect(days(parseQuickAdd('Plan trip >in 2 weeks').startDate)).toBe(14);
		expect(parseQuickAdd('Pay rent !dans 3 jours').title).toBe('Pay rent');
	});
	it('understands compact forms', () => {
		expect(days(parseQuickAdd('x !+3').dueDate)).toBe(3);
		expect(days(parseQuickAdd('x !3d').dueDate)).toBe(3);
		expect(days(parseQuickAdd('x !2w').dueDate)).toBe(14);
	});
	it('understands English and French day words', () => {
		expect(days(parseQuickAdd('x !today').dueDate)).toBe(0);
		expect(days(parseQuickAdd("x !aujourd'hui").dueDate)).toBe(0);
		expect(days(parseQuickAdd('x !demain').dueDate)).toBe(1);
		const mon = days(parseQuickAdd('x !monday').dueDate);
		expect(mon).toBeGreaterThanOrEqual(1);
		expect(mon).toBeLessThanOrEqual(7);
		expect(days(parseQuickAdd('x !lundi').dueDate)).toBe(mon);
		expect(days(parseQuickAdd('x !mon').dueDate)).toBe(mon);
	});
	it('reads a time after the date', () => {
		const d = parseQuickAdd('Meeting !demain 14h').dueDate!;
		expect(d.getHours()).toBe(14);
		expect(parseQuickAdd('Meeting !demain 14h').title).toBe('Meeting');
		expect(parseQuickAdd('Meeting !fri 9h30').dueDate!.getMinutes()).toBe(30);
	});
	it('leaves unknown date text in the title, and a plain DD/MM date works', () => {
		expect(parseQuickAdd('Ship !someday').title).toBe('Ship !someday');
		const d = parseQuickAdd('x !25/12').dueDate!;
		expect([d.getDate(), d.getMonth()]).toEqual([25, 11]);
	});
});
