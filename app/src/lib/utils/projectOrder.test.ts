import { describe, it, expect } from 'vitest';
import { computeMove, isDescendant, compareProjects, positionAtEnd, freezePlan } from './projectOrder';
import type { VikunjaProject } from '../types';

const p = (id: number, title: string, parent = 0, position = 0): VikunjaProject => ({
	id,
	title,
	parent_project_id: parent,
	position
});
const list = [p(1, 'Pro'), p(2, 'Perso'), p(3, 'Admin', 1), p(4, 'Client A', 1), p(5, 'Home', 2)];

describe('projectOrder', () => {
	it('sorts by position, then creation order (never alphabetically)', () => {
		expect([p(2, 'a', 0, 2), p(1, 'b', 0, 2), p(3, 'z', 0, 1)].sort(compareProjects).map((x) => x.id)).toEqual([3, 1, 2]);
	});
	it('a project not yet saved on the server goes after the saved ones', () => {
		expect([p(-1, 'new', 0, 5), p(7, 'old', 0, 5)].sort(compareProjects).map((x) => x.id)).toEqual([7, -1]);
	});
	it('positionAtEnd is one past the last sibling', () => {
		expect(positionAtEnd([p(1, 'a', 0, 3), p(2, 'b', 0, 9)])).toBe(10);
		expect(positionAtEnd([])).toBe(1);
	});
	it('freezePlan keeps today\'s alphabetical look, and leaves groups that are already fine', () => {
		const tied = [p(1, 'beta', 0), p(2, 'alpha', 0), p(3, 'gamma', 0)];
		const plan = freezePlan(tied);
		expect(plan.sort((a, b) => a.position - b.position).map((x) => x.id)).toEqual([2, 1, 3]);
		expect(freezePlan([p(1, 'x', 0, 1), p(2, 'y', 0, 2)])).toEqual([]);
		expect(freezePlan([p(1, 'x', 0, 5), p(2, 'y', 0, 9)])).toEqual([]);
	});
	it('detects descendants', () => {
		expect(isDescendant(list, 3, 1)).toBe(true);
		expect(isDescendant(list, 1, 3)).toBe(false);
	});
	it('reorders within the same parent', () => {
		const m = computeMove(list, 4, 3, 'before')!;
		expect(m.parent).toBe(1);
		expect(m.updates.find((u) => u.id === 4)!.position).toBe(1);
		expect(m.updates.find((u) => u.id === 3)!.position).toBe(2);
	});
	it('changes parent when dropped inside another project', () => {
		const m = computeMove(list, 3, 2, 'inside')!;
		expect(m.parent).toBe(2);
		expect(m.updates.find((u) => u.id === 3)).toMatchObject({ parent: 2, position: 2 });
	});
	it('drops next to a project of another parent', () => {
		const m = computeMove(list, 3, 5, 'after')!;
		expect(m.parent).toBe(2);
	});
	it('refuses a project onto itself or into its own sub-tree', () => {
		expect(computeMove(list, 1, 1, 'inside')).toBeNull();
		expect(computeMove(list, 1, 3, 'inside')).toBeNull();
	});
});

import { treeOrder } from './projectOrder';
describe('treeOrder', () => {
	it('lists parents before their children, in panel order', () => {
		const p = (id: number, parent: number, position: number) => ({ id, title: 't' + id, parent_project_id: parent, position }) as VikunjaProject;
		const out = treeOrder([p(3, 1, 2), p(2, 1, 1), p(1, 0, 5), p(4, 0, 1)]);
		expect(out.map((o) => [o.project.id, o.depth])).toEqual([[4, 0], [1, 0], [2, 1], [3, 1]]);
	});
});
