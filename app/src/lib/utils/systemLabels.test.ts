import { describe, it, expect } from 'vitest';
import { splitSystemLabels } from './systemLabels';

const L = (id: number, title: string) => ({ id, title, hex_color: '' }) as never;

describe('splitSystemLabels', () => {
	it('puts the labels used by the app and the automations first, in a fixed order', () => {
		const { system, other } = splitSystemLabels([L(1, 'call'), L(2, 'p1'), L(3, 'Today'), L(4, 'shopping'), L(5, '<15'), L(6, 'next-action')]);
		expect(system.map((l: { id: number }) => l.id)).toEqual([3, 6, 2, 4]);
		expect(other.map((l: { id: number }) => l.id)).toEqual([1, 5]);
	});
});
