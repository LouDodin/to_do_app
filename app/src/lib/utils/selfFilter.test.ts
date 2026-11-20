import { describe, it, expect } from 'vitest';
import { matchSelfFilter, isActive, parseSelfFilter, EMPTY_FILTER, type SelfFilter } from './selfFilter';

const L = (id: number) => ({ id, title: 'l' + id }) as any;
const T = (o: Partial<any>) => ({ id: 1, title: 'Call the bank', description: '', project_id: 10, labels: [], due_date: '0001-01-01T00:00:00Z', ...o }) as any;
const projects = [
	{ id: 10, title: 'Admin', parent_project_id: 0 },
	{ id: 11, title: 'Taxes', parent_project_id: 10 },
	{ id: 12, title: 'Deep', parent_project_id: 11 },
	{ id: 20, title: 'Other', parent_project_id: 0 }
] as any;
const now = new Date(2026, 9, 19, 15, 0); // Mon 19 Oct 2026, 15:00 local
const F = (o: Partial<SelfFilter>): SelfFilter => ({ ...EMPTY_FILTER, ...o });
const m = (t: any, f: Partial<SelfFilter>) => matchSelfFilter(t, F(f), projects, now);
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).toISOString();

describe('my filter', () => {
	it('an empty filter is inactive and matches everything', () => {
		expect(isActive(EMPTY_FILTER)).toBe(false);
		expect(m(T({}), {})).toBe(true);
	});
	it('text: every word, any order, accents and case ignored, title or description', () => {
		expect(m(T({ title: 'Réserver les trains' }), { text: 'TRAINS reserver' })).toBe(true);
		expect(m(T({ title: 'x', description: '<p>pour le <b>Nouvel An</b></p>' }), { text: 'nouvel an' })).toBe(true);
		expect(m(T({ title: 'Réserver les trains' }), { text: 'trains avion' })).toBe(false);
	});
	it('text also finds a task by its label names and its project name', () => {
		expect(m(T({ title: 'Write postcard', labels: [{ id: 9, title: 'dad-place' }] }), { text: 'dad' })).toBe(true);
		expect(m(T({ title: 'Write postcard', project_id: 11 }), { text: 'postcard taxes' })).toBe(true);
		expect(m(T({ title: 'Write postcard', project_id: 20 }), { text: 'taxes' })).toBe(false);
	});
	it('labels: all of "with", none of "without"', () => {
		const t = T({ labels: [L(1), L(2)] });
		expect(m(t, { withLabels: [1, 2] })).toBe(true);
		expect(m(t, { withLabels: [1, 3] })).toBe(false);
		expect(m(t, { withoutLabels: [2] })).toBe(false);
		expect(m(t, { withLabels: [1], withoutLabels: [3] })).toBe(true);
	});
	it('project includes its sub-projects', () => {
		expect(m(T({ project_id: 12 }), { projectId: 10 })).toBe(true);
		expect(m(T({ project_id: 20 }), { projectId: 10 })).toBe(false);
	});
	it('due dates', () => {
		const none = T({});
		const yesterday = T({ due_date: at(2026, 10, 18) });
		const today = T({ due_date: at(2026, 10, 19, 23) });
		const in6 = T({ due_date: at(2026, 10, 25, 20) });
		const in8 = T({ due_date: at(2026, 10, 27) });
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'overdue' }))).toEqual([false, true, false, false, false]);
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'today' }))).toEqual([false, false, true, false, false]);
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'week' }))).toEqual([false, false, true, true, false]);
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'none' }))).toEqual([true, false, false, false, false]);
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'dated' }))).toEqual([false, true, true, true, true]);
		expect([none, yesterday, today, in6, in8].map((t) => m(t, { due: 'range', from: '2026-10-19', to: '2026-10-25' }))).toEqual([false, false, true, true, false]);
	});
	it('everything combined with AND', () => {
		const t = T({ title: 'Pay taxes', project_id: 11, labels: [L(1)], due_date: at(2026, 10, 20) });
		expect(m(t, { text: 'taxes', withLabels: [1], projectId: 10, due: 'week' })).toBe(true);
		expect(m(t, { text: 'taxes', withLabels: [1], projectId: 10, due: 'overdue' })).toBe(false);
	});
	it('a saved filter survives damaged storage', () => {
		expect(parseSelfFilter('{oops')).toEqual(EMPTY_FILTER);
		expect(parseSelfFilter(JSON.stringify({ text: 'a', withLabels: [1, 'x'], due: 'nope' })).withLabels).toEqual([1]);
		expect(parseSelfFilter(JSON.stringify({ due: 'nope' })).due).toBe('any');
	});
	it("labels in 'any' mode: one of them is enough, 'without' still excludes", () => {
		const t = T({ labels: [L(1)] });
		expect(m(t, { withLabels: [1, 2] })).toBe(false);
		expect(m(t, { withLabels: [1, 2], labelMode: 'any' })).toBe(true);
		expect(m(T({ labels: [L(3)] }), { withLabels: [1, 2], labelMode: 'any' })).toBe(false);
		expect(m(t, { withLabels: [1, 2], labelMode: 'any', withoutLabels: [1] })).toBe(false);
		expect(parseSelfFilter('{"labelMode":"any"}').labelMode).toBe('any');
		expect(parseSelfFilter('{}').labelMode).toBe('all');
	});
});
