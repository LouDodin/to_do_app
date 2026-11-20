import { describe, it, expect } from 'vitest';
import { findDuplicateLabels, findDuplicateProjects, findDuplicateFilters, normaliseFilter, remapFilterIds } from './dedupe';

const L = (id: number, title: string) => ({ id, title }) as any;
const P = (id: number, title: string, parent = 0) => ({ id, title, parent_project_id: parent }) as any;
const F = (id: number, title: string, filter: string) => ({ id, title, filters: { filter } }) as any;

describe('dedupe', () => {
	it('labels: case/space-insensitive, keeps lowest id', () => {
		const g = findDuplicateLabels([L(5, 'Urgent'), L(2, ' urgent '), L(3, 'other')]);
		expect(g).toHaveLength(1);
		expect(g[0].keep.id).toBe(2);
		expect(g[0].remove.map((l: any) => l.id)).toEqual([5]);
	});
	it('projects: same name under different parents is fine', () => {
		expect(findDuplicateProjects([P(1, 'A'), P(2, 'A', 1)])).toHaveLength(0);
		expect(findDuplicateProjects([P(1, 'A'), P(2, 'a')])).toHaveLength(1);
	});
	it('projects: ignores saved-filter pseudo projects', () => {
		expect(findDuplicateProjects([P(-2, 'A'), P(-3, 'A')])).toHaveLength(0);
	});
	it('filters: identical vs conflicting', () => {
		const r = findDuplicateFilters([F(1, 'X', 'labels in 3, 1'), F(2, 'x', 'labels in 1,3,1'), F(3, 'Y', 'done = false'), F(4, 'Y', 'done = true')]);
		expect(r.identical).toHaveLength(1);
		expect(r.identical[0].keep.id).toBe(1);
		expect(r.conflicting).toHaveLength(1);
	});
	it('normaliseFilter sorts and dedupes ids', () => {
		expect(normaliseFilter('labels in 3, 1, 3')).toBe(normaliseFilter('labels in 1,3'));
	});
	it('remapFilterIds replaces and dedupes', () => {
		expect(remapFilterIds('done = false && labels in 5, 2', 'labels', new Map([[5, 2]]))).toContain('labels in 2');
		expect(remapFilterIds('labels in 5, 2', 'labels', new Map([[5, 2]]))).not.toMatch(/2,\s*2/);
	});
});

describe('dedupe names', () => {
	it('ignores case, accents, emoji and punctuation', () => {
		expect(findDuplicateLabels([{ id: 1, title: 'Today' } as any, { id: 2, title: ' today 🔥' } as any])).toHaveLength(1);
		expect(findDuplicateLabels([{ id: 1, title: 'Café' } as any, { id: 2, title: 'cafe' } as any])).toHaveLength(1);
	});
});

describe('dedupe keeps different symbols apart', () => {
	it('<60 vs >60, p1 vs p2, 2024 vs 2025, a+b vs a-b', () => {
		const L = (id: number, title: string) => ({ id, title }) as any;
		expect(findDuplicateLabels([L(1, '<60'), L(2, '>60'), L(3, 'p1'), L(4, 'p2'), L(5, '2024'), L(6, '2025'), L(7, 'a+b'), L(8, 'a-b'), L(9, '60'), L(10, '≤60')])).toHaveLength(0);
	});
});

describe('filter duplicates with numbers', () => {
	const known = { labelIds: new Set([4, 5]), projectIds: new Set([1]) };
	it('numbered filter wins over a same-named unnumbered one', () => {
		const r = findDuplicateFilters([F(11, '4. Red', 'labels in 5'), F(13, 'Red', 'due_date <= now')], known);
		expect(r.identical).toHaveLength(1);
		expect(r.identical[0].keep.id).toBe(11);
		expect(r.identical[0].remove.map((f: any) => f.id)).toEqual([13]);
	});
	it('a filter pointing at a deleted label is the one removed', () => {
		const r = findDuplicateFilters([F(1, 'Available', 'labels in 246'), F(2, 'available', 'labels in 4')], known);
		expect(r.identical[0].keep.id).toBe(2);
	});
	it('two working, different, unnumbered filters need a human', () => {
		const r = findDuplicateFilters([F(1, 'Red', 'labels in 4'), F(2, 'Red', 'labels in 5')], known);
		expect(r.conflicting).toHaveLength(1);
	});
});
