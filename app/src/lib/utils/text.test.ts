import { describe, it, expect } from 'vitest';
import { capitalizeFirst } from './text';

describe('capitalizeFirst', () => {
	it('capitalises the first letter', () => {
		expect(capitalizeFirst('call the doctor')).toBe('Call the doctor');
		expect(capitalizeFirst('écrire à Sarah')).toBe('Écrire à Sarah');
		expect(capitalizeFirst('  acheter du pain')).toBe('  Acheter du pain');
	});
	it('leaves alone what should not change', () => {
		expect(capitalizeFirst('Already fine')).toBe('Already fine');
		expect(capitalizeFirst('iPhone repair')).toBe('iPhone repair');
		expect(capitalizeFirst('https://example.org read this')).toBe('https://example.org read this');
		expect(capitalizeFirst('marc@example.org reply')).toBe('marc@example.org reply');
		expect(capitalizeFirst('15° final host samples')).toBe('15° final host samples');
		expect(capitalizeFirst('')).toBe('');
	});
});
