import { describe, it, expect } from 'vitest';
import { tomorrowReview, weeklyReview, reviewable } from './reviews';

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).toISOString();
const now = new Date(2026, 9, 19, 20, 0); // Mon 19 Oct 2026, 20:00 local
const lab = (title: string) => ({ id: title.length, title }) as any;
const T = (o: Partial<any>) => ({ id: 1, title: 't', project_id: 10, labels: [], done: false, due_date: '0001-01-01T00:00:00Z', updated: at(2026, 10, 18), created: at(2026, 10, 1), ...o }) as any;
const projects = [
	{ id: 1, title: 'Inbox', parent_project_id: 0 },
	{ id: 10, title: 'Work', parent_project_id: 0 },
	{ id: 50, title: 'Bin', parent_project_id: 0 },
	{ id: 51, title: 'Inside bin', parent_project_id: 50 },
	{ id: 60, title: 'Old', parent_project_id: 0, is_archived: true }
] as any;

describe('reviews', () => {
	it('leaves out the Bin (and what is under it) and archived projects', () => {
		const ts = [T({ id: 1 }), T({ id: 2, project_id: 50 }), T({ id: 3, project_id: 51 }), T({ id: 4, project_id: 60 })];
		expect(reviewable(ts, projects).map((t) => t.id)).toEqual([1]);
	});
	it("tomorrow: the list, today's done tasks and what is due by tomorrow night", () => {
		const ts = [
			T({ id: 1, labels: [lab('today')] }),
			T({ id: 2, labels: [lab('today')], done: true, done_at: at(2026, 10, 19, 9) }),
			T({ id: 3, done: true, done_at: at(2026, 10, 18, 9) }),
			T({ id: 4, due_date: at(2026, 10, 20, 23) }),
			T({ id: 5, due_date: at(2026, 10, 21, 9) }),
			T({ id: 6, due_date: at(2026, 10, 10) }),
			T({ id: 7, due_date: at(2026, 10, 20), labels: [lab('today')] }),
			T({ id: 8, project_id: 1, due_date: at(2026, 10, 20) }) // still in the Inbox
		];
		const r = tomorrowReview(ts, projects, now);
		expect(r.chosen.map((t) => t.id)).toEqual([1, 7]);
		expect(r.doneToday.map((t) => t.id)).toEqual([2]);
		expect(r.dueSoon.map((t) => t.id)).toEqual([6, 4]);
	});
	it('weekly: inbox, overdue, next 7 days, waiting, untouched, done and created this week', () => {
		const ts = [
			T({ id: 1, project_id: 1 }),
			T({ id: 2, labels: [lab('ctx:review')] }),
			T({ id: 3, due_date: at(2026, 10, 19, 8) }),
			T({ id: 4, due_date: at(2026, 10, 26, 10) }),
			T({ id: 5, due_date: at(2026, 10, 28, 10) }),
			T({ id: 6, labels: [lab('waiting-for')] }),
			T({ id: 7, updated: at(2026, 7, 1), created: at(2026, 6, 1) }),
			T({ id: 8, done: true, done_at: at(2026, 10, 15), created: at(2026, 10, 14) }),
			T({ id: 9, done: true, done_at: at(2026, 10, 5) })
		];
		const r = weeklyReview(ts, projects, now);
		expect(r.inbox.map((t) => t.id).sort()).toEqual([1, 2]);
		expect(r.overdue.map((t) => t.id)).toEqual([3]);
		expect(r.nextWeek.map((t) => t.id)).toEqual([4]);
		expect(r.waiting.map((t) => t.id)).toEqual([6]);
		expect(r.untouched.map((t) => t.id)).toEqual([7]);
		expect(r.doneWeek.map((t) => t.id)).toEqual([8]);
		expect(r.createdWeek).toBe(1);
	});
	it('weekly: a pending task is listed with the pending ones, not as untouched', () => {
		const old = { updated: at(2026, 7, 1), created: at(2026, 6, 1) };
		const r = weeklyReview([T({ id: 1, labels: [lab('ctx:pending')], ...old }), T({ id: 2, ...old })], projects, now);
		expect(r.pending.map((t) => t.id)).toEqual([1]);
		expect(r.untouched.map((t) => t.id)).toEqual([2]);
	});
});

import { candidates, excludedProjectIds } from './reviews';
describe('candidates (13 Nov 2026)', () => {
	const P = (id: number, title = 'P' + id) => ({ id, title, parent_project_id: 0 }) as never;
	const L = (title: string) => ({ id: title.length, title }) as never;
	const T = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: 't' + id, done: false, project_id: 2, labels: [L('ctx:validated')], created: '2026-01-01T00:00:00Z', ...extra }) as never;
	const now = new Date('2026-11-13T18:00:00Z');
	it('groups by week, next action, due soon, due later, recent; leaves out the rest', () => {
		const tasks = [
			T(1, { labels: [L('ctx:validated'), L('week')] }),
			T(2, { labels: [L('ctx:validated'), L('next-action')] }),
			T(3, { due_date: '2026-11-20T10:00:00Z' }),
			T(4, { due_date: '2027-03-01T10:00:00Z' }),
			T(5, { created: '2026-11-10T10:00:00Z' }),
			T(6),
			T(7, { labels: [L('ctx:validated'), L('next-action'), L('ctx:pending')] }),
			T(8, { labels: [L('ctx:validated'), L('next-action')], start_date: '2026-12-01T09:00:00Z' }),
			T(9, { project_id: 3 }),
			T(10, { labels: [L('ctx:validated'), L('shopping'), L('next-action')] })
		];
		const r = candidates(tasks, [P(1, 'Inbox'), P(2), P(3)], { now, singleProjects: new Set([3]) });
		expect(r.map((g) => [g.group, g.tasks.map((t: { id: number }) => t.id)])).toEqual([
			['This week', [1]],
			['Next actions', [2, 9]],
			['Due soon', [3]],
			['Due later', [4]],
			['Recently added', [5]]
		]);
	});
	it('reads the projects the saved filters leave out', () => {
		expect([...excludedProjectIds('done = false && (project_id not in 8,19, 23)')]).toEqual([8, 19, 23]);
		expect(excludedProjectIds(undefined).size).toBe(0);
	});
});
