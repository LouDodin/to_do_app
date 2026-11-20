import { describe, it, expect } from 'vitest';
import { cleanFilterTitle, orderFilters, legacyOrder, moveInOrder } from './filterOrder';
const F = (id: number, title: string) => ({ id, title, filters: { filter: '' } }) as any;
describe('filterOrder', () => {
	it('strips leading numbers', () => {
		expect(cleanFilterTitle('7. Groceries')).toBe('Groceries');
		expect(cleanFilterTitle('10) Done')).toBe('Done');
		expect(cleanFilterTitle('2024 plan')).toBe('2024 plan');
		expect(cleanFilterTitle('3.')).toBe('3.');
	});
	it('the old order (number, then name) is only used to write the order down once', () => {
		const fs = [F(1, '2. B'), F(2, '1. A'), F(3, 'Zed')];
		expect(legacyOrder(fs).map((f) => f.id)).toEqual([2, 1, 3]);
	});
	it('saved order wins; other filters follow in creation order, never by name', () => {
		const fs = [F(5, 'Zed'), F(2, 'Alpha'), F(4, 'Beta'), F(-1, 'Aardvark')];
		expect(orderFilters(fs, [4]).map((f) => f.id)).toEqual([4, 2, 5, -1]);
		expect(orderFilters(fs, [4, 5, 2, -1]).map((f) => f.id)).toEqual([4, 5, 2, -1]);
	});
	it('moves', () => expect(moveInOrder([1, 2, 3], 0, 2)).toEqual([2, 3, 1]));
});
