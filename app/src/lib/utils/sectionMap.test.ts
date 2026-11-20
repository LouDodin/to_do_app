import { describe, it, expect } from 'vitest';
import { snapshot, toApply, newSectionId } from './sectionMap';

describe('sections shared between devices', () => {
	it('takes the sections, the task assignments and the order of a project', () => {
		const r = snapshot([{ id: -5, title: 'Alpha', position: 0 }], [{ id: 10, section_id: -5, local_order: 2 }, { id: 11, section_id: -9 }, { id: -3, section_id: -5 }], 1000)!;
		expect(r).toEqual({ u: 1000, s: [[-5, 'Alpha', 0]], a: { '10': -5 }, o: { '10': 2 } });
	});
	it('nothing to keep: no record', () => {
		expect(snapshot([], [{ id: 10 }])).toBeNull();
	});
	it('applies only newer records, never over unsent local changes', () => {
		const remote = { '1': { u: 5, s: [], a: {}, o: {} }, '2': { u: 9, s: [], a: {}, o: {} }, '3': { u: 9, s: [], a: {}, o: {} } };
		expect(toApply(remote, { '1': 5, '2': 3 }, new Set(['3']))).toEqual(['2']);
	});
	it('new ids do not clash', () => {
		const a = newSectionId([]);
		expect(a).toBeLessThan(0);
		expect(newSectionId([a])).not.toBe(a);
	});
});
