import { describe, it, expect } from 'vitest';
import { isBinProject, daysLeftInBin, binExpired } from './bin';

describe('bin helpers', () => {
	it('recognises only a top-level project called Bin', () => {
		expect(isBinProject({ title: ' bin ', parent_project_id: 0 })).toBe(true);
		expect(isBinProject({ title: 'Bin', parent_project_id: 5 })).toBe(false);
		expect(isBinProject({ title: 'Recycling' })).toBe(false);
	});
	it('counts the days left', () => {
		const now = Date.parse('2026-10-31T12:00:00Z');
		expect(daysLeftInBin('2026-10-31T11:00:00Z', now)).toBe(30);
		expect(daysLeftInBin('2026-10-11T12:00:00Z', now)).toBe(10);
		expect(daysLeftInBin('2026-08-01T12:00:00Z', now)).toBe(0);
	});
	it('expires after 30 days only', () => {
		const now = Date.parse('2026-10-31T12:00:00Z');
		expect(binExpired('2026-10-02T12:00:00Z', now)).toBe(false);
		expect(binExpired('2026-09-29T12:00:00Z', now)).toBe(true);
		expect(binExpired(undefined, now)).toBe(false);
	});
});
