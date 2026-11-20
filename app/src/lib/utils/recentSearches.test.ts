import { describe, it, expect } from 'vitest';
import { addRecent, type RecentResult } from './recentSearches';
const R = (kind: string, id: number): RecentResult => ({ kind, id, label: kind + id });
describe('recent results', () => {
	it('keeps 10, newest first, one entry per item', () => {
		let l: RecentResult[] = [];
		for (let i = 0; i < 12; i++) l = addRecent(l, R('Task', i));
		expect(l).toHaveLength(10);
		expect(l[0].id).toBe(11);
		l = addRecent(l, R('Task', 5));
		expect(l[0].id).toBe(5);
		expect(l.filter((x) => x.id === 5)).toHaveLength(1);
	});
	it('same id but another kind is a different item', () => {
		expect(addRecent([R('Task', 1)], R('Label', 1))).toHaveLength(2);
	});
});
