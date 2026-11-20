import { describe, it, expect } from 'vitest';
import { upcoming, planFor, dayStart } from './upcoming';

const L = (title: string) => ({ id: title.length, title }) as never;
const T = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: 't' + id, done: false, project_id: 2, labels: [L('ctx:validated')], ...extra }) as never;
const P = [{ id: 1, title: 'Inbox' }, { id: 2, title: 'Work' }] as never;
const now = new Date(2026, 10, 13, 18, 0); // Fri 13 Nov 2026, 18:00
const at = (day: number, h = 9) => new Date(2026, 10, day, h, 0).toISOString();

describe('upcoming (13 Nov 2026)', () => {
	it('puts a task under the day it starts, and under the day it is due', () => {
		const u = upcoming([T(1, { start_date: at(13) }), T(2, { start_date: at(16) }), T(3, { due_date: at(15, 23) }), T(4, { start_date: at(14), due_date: at(14, 23) }), T(5, { start_date: at(10) }), T(6, { start_date: at(20), done: true })], P, now);
		expect(u.days).toHaveLength(61);
		expect(u.days[0].planned.map((t: { id: number }) => t.id)).toEqual([1]);
		expect(u.days[1].planned.map((t: { id: number }) => t.id)).toEqual([4]);
		expect(u.days[1].due).toEqual([]); // already listed as planned that day
		expect(u.days[2].due.map((t: { id: number }) => t.id)).toEqual([3]);
		expect(u.days[3].planned.map((t: { id: number }) => t.id)).toEqual([2]);
		const o = upcoming([T(7, { due_date: at(2, 20), start_date: at(1) }), T(8, { start_date: at(20), due_date: at(22, 23) })], P, now);
		expect(o.overdue.map((t: { id: number }) => t.id)).toEqual([7]);
		// due later than it starts: under both days
		expect(o.days[7].planned.map((t: { id: number }) => t.id)).toEqual([8]);
		expect(o.days[9].due.map((t: { id: number }) => t.id)).toEqual([8]);
	});
	it('lists the week tasks with no day yet; two months at least, more up to the last planned task', () => {
		const u = upcoming([T(1, { labels: [L('ctx:validated'), L('week')] }), T(2, { labels: [L('ctx:validated'), L('week')], start_date: at(15) }), T(3, { start_date: at(25) }), T(4, { due_date: at(25, 23) }), T(5, { start_date: at(26), labels: [L('ctx:validated'), L('ctx:pending')] })], P, now);
		expect(u.toPlan.map((t: { id: number }) => t.id)).toEqual([1]);
		expect(u.days[12].planned.map((t: { id: number }) => t.id)).toEqual([3]);
		expect(u.days[12].due.map((t: { id: number }) => t.id)).toEqual([4]);
		const far = upcoming([T(9, { start_date: new Date(2027, 2, 1, 9).toISOString() })], P, now);
		expect(far.days.at(-1)!.date.getMonth()).toBe(2);
		expect(far.days.at(-1)!.planned.map((t: { id: number }) => t.id)).toEqual([9]);
	});
	it('shows an Inbox task once a day was chosen for it', () => {
		const inb = (id: number, extra: Record<string, unknown>) => ({ id, title: 't' + id, done: false, project_id: 1, labels: [], ...extra }) as never;
		const u = upcoming([inb(1, { created: at(13, 8), start_date: at(13, 8) }), inb(2, { created: at(13, 8), start_date: at(16) })], P, now);
		expect(u.days[3].planned.map((t: { id: number }) => t.id)).toEqual([2]);
		expect(u.days[0].planned).toEqual([]);
		// Not only in the Inbox: a start date equal to the creation is no plan
		const v = upcoming([T(3, { created: at(13, 10), start_date: at(13, 10) }), T(4, { created: at(13, 10), start_date: at(13, 15) })], P, now);
		expect(v.days[0].planned.map((t: { id: number }) => t.id)).toEqual([4]);
	});
	it('keeps the time of day when planning', () => {
		expect(new Date(planFor({ start_date: at(10, 14) }, dayStart(now, 2))).getHours()).toBe(14);
		expect(new Date(planFor({ start_date: null }, dayStart(now, 2))).getHours()).toBe(9);
		expect(new Date(planFor({ start_date: null }, dayStart(now, 2))).getDate()).toBe(15);
	});
});
