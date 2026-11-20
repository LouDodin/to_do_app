import { describe, it, expect } from 'vitest';
import { parseLabelIds, labelHref, matchesLabels } from './labelFilter';

describe('several labels at once', () => {
	it('reads the address', () => {
		expect(parseLabelIds('12+15')).toEqual([12, 15]);
		expect(parseLabelIds('12 15')).toEqual([12, 15]); // a "+" can arrive as a space
		expect(parseLabelIds('7')).toEqual([7]);
		expect(parseLabelIds('x+0+7+7')).toEqual([7]);
	});
	it('a click in the menu adds or removes the label on a label page, else opens it alone', () => {
		expect(labelHref(3, '/project/9')).toBe('/label/3');
		expect(labelHref(3, '/label/5')).toBe('/label/5+3');
		expect(labelHref(5, '/label/5+3')).toBe('/label/3');
		expect(labelHref(5, '/label/5')).toBe('/');
		expect(labelHref(4, '/label/5+3', '?any=1')).toBe('/label/5+3+4?any=1');
		expect(labelHref(3, '/label/5+3', '?any=1')).toBe('/label/5');
	});
	it('all of them, or any of them', () => {
		const t = { labels: [{ id: 1 }, { id: 2 }] };
		expect(matchesLabels(t, [1, 2])).toBe(true);
		expect(matchesLabels(t, [1, 3])).toBe(false);
		expect(matchesLabels(t, [1, 3], true)).toBe(true);
		expect(matchesLabels({ labels: null }, [1], true)).toBe(false);
	});
});
