import { describe, it, expect } from 'vitest';
import { partitionHomeBlocks } from './queries';

const lab = (title: string) => ({ id: title.length, title }) as any;
const T = (id: number, labels: string[], done = false) => ({ id, title: 't' + id, done, project_id: 1, labels: labels.map(lab) }) as any;

describe('partitionHomeBlocks', () => {
	it('the week’s list is a block of its own, under Today', () => {
		const r = partitionHomeBlocks([T(1, ['week']), T(2, ['week', 'today']), T(3, ['week', 'p1']), T(4, ['week', 'shopping']), T(5, ['next-action'])]);
		expect(r.week.map((t) => t.id)).toEqual([1, 3]);
		expect(r.today.map((t) => t.id)).toEqual([2]);
		expect(r.red).toHaveLength(0);
		expect(r.available.map((t) => t.id)).toEqual([5]);
	});
	it('puts each task in exactly one block', () => {
		const pool = [T(1, ['today', 'overdue', 'next-action']), T(2, ['overdue', 'next-action']), T(3, ['next-action']), T(4, ['p1']), T(5, [])];
		const r = partitionHomeBlocks(pool);
		const all = [...r.today, ...r.red, ...r.available, ...r.all].map((t) => t.id);
		expect(new Set(all).size).toBe(all.length);
		expect(all.sort()).toEqual([1, 2, 3, 4, 5]);
		expect(r.today.map((t) => t.id)).toEqual([1]);
		expect(r.red.map((t) => t.id).sort()).toEqual([2, 4]);
		expect(r.available.map((t) => t.id)).toEqual([3]);
	});
	it('tasks of a "SINGLE TASKS …" project are available without next-action (not when waiting)', () => {
		const P = (id: number, project: number, labels: string[] = []) => ({ ...T(id, labels), project_id: project });
		const r = partitionHomeBlocks([P(1, 7), P(2, 7, ['waiting-for']), P(3, 7, ['p1']), P(4, 8)], new Set([7]));
		expect(r.available.map((t) => t.id)).toEqual([1]);
		expect(r.red.map((t) => t.id)).toEqual([3]);
		expect(r.all.map((t) => t.id).sort()).toEqual([2, 4]);
	});
	it('shopping items stay out of the blocks, unless chosen for today or urgent', () => {
		const r = partitionHomeBlocks([T(1, ['shopping']), T(2, ['shopping', 'next-action']), T(3, ['shopping', 'today']), T(4, ['shopping', 'p1'])]);
		expect([...r.available, ...r.all].map((t) => t.id)).toEqual([]);
		expect(r.today.map((t) => t.id)).toEqual([3]);
		expect(r.red.map((t) => t.id)).toEqual([4]);
	});
	it('label names are case-insensitive', () => {
		expect(partitionHomeBlocks([T(1, ['Overdue'])]).red).toHaveLength(1);
	});
});
