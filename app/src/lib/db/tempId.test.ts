import { describe, it, expect } from 'vitest';
import { nextTempId } from './tempId';

describe('nextTempId', () => {
	it('is unique, negative and far below the server pseudo-project ids', () => {
		const ids = Array.from({ length: 5000 }, () => nextTempId());
		expect(new Set(ids).size).toBe(ids.length);
		expect(Math.max(...ids)).toBeLessThan(-1_000_000);
		expect(ids.every(Number.isSafeInteger)).toBe(true);
	});
	it('does not restart at -1 after a reload (ids depend on the clock)', () => {
		const id = nextTempId();
		expect(id).toBeLessThan(-Date.UTC(2024, 0, 1) * 1000 + 1);
	});
});
