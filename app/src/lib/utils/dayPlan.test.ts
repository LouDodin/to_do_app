import { describe, it, expect } from 'vitest';
import { notePlanned, mergePlans, daySummary, dayKey, nextDayKey, lastDays } from './dayPlan';
import type { VikunjaTask } from '../types';

const today = { id: 1, title: 'today', hex_color: '000000' };
const T = (id: number, o: Partial<VikunjaTask> = {}): VikunjaTask => ({ id, title: 't' + id, project_id: 5, done: false, labels: [], ...o }) as VikunjaTask;
const now = new Date(2026, 10, 5, 18, 0);

describe('day plan', () => {
	it('writes down the tasks labelled today, and keeps them once completed', () => {
		const p1 = notePlanned({}, [T(10, { labels: [today] }), T(11)], now)!;
		expect(p1[dayKey(now)]).toEqual([10]);
		// completed meanwhile: the label is gone, the task stays planned
		expect(notePlanned(p1, [T(10, { done: true }), T(12, { labels: [today] })], now)![dayKey(now)]).toEqual([10, 12]);
		expect(notePlanned(p1, [T(10, { labels: [today] })], now)).toBeNull();
	});
	it('a task chosen tonight for tomorrow is not planned for today', () => {
		const p = notePlanned({ [nextDayKey(now)]: [10] }, [T(10, { labels: [today] }), T(11, { labels: [today] })], now)!;
		expect(p[dayKey(now)]).toEqual([11]);
		expect(lastDays(3, now)).toEqual(['2026-11-05', '2026-11-04', '2026-11-03']);
	});
	it('forgets days older than two weeks', () => {
		const p = notePlanned({ '2026-10-01': [1] }, [T(10, { labels: [today] })], now)!;
		expect(Object.keys(p)).toEqual([dayKey(now)]);
	});
	it('merges two devices', () => {
		expect(mergePlans({ a: [1] }, { a: [2], b: [3] })).toEqual({ a: [1, 2], b: [3] });
	});
	it('summarises: planned done or not, and done without being planned', () => {
		const at = new Date(2026, 10, 5, 10).toISOString();
		const tasks = [T(10, { done: true, done_at: at }), T(11), T(12, { done: true, done_at: at }), T(13, { done: true, done_at: new Date(2026, 10, 4, 10).toISOString() })];
		const s = daySummary({ [dayKey(now)]: [10, 11] }, tasks, now);
		expect(s.planned.map((x) => [x.task.id, x.done])).toEqual([[10, true], [11, false]]);
		expect(s.alsoDone.map((t) => t.id)).toEqual([12]);
	});
	it('an abandoned task is never counted as done', () => {
		const at = new Date(2026, 10, 5, 10).toISOString();
		const ab = { done: true, done_at: at, labels: [{ id: 9, title: 'ctx:abandoned' }] } as never;
		const s = daySummary({ [dayKey(now)]: [10] }, [T(10, ab), T(12, ab)], now);
		expect(s.planned.map((x) => [x.task.id, x.done])).toEqual([[10, false]]);
		expect(s.alsoDone).toEqual([]);
	});
});
