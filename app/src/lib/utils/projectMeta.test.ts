import { describe, it, expect } from 'vitest';
import { parseDescription, buildDescription, withMeta, today } from './projectMeta';
import { descriptionWithType, descriptionWithoutType, projectOwnType } from './context';

describe('project meta lines', () => {
	it('reads every setting and keeps the user text', () => {
		const { meta, rest } = parseDescription('[ctx:pro]\n[pending]\n[start:2026-10-08]\nMy notes\nsecond line');
		expect(meta).toEqual({ ctx: 'pro', pending: true, start: '2026-10-08', end: null });
		expect(rest).toBe('My notes\nsecond line');
	});
	it('ignores marker-like text that is not at the top', () => {
		expect(parseDescription('notes\n[pending]').meta.pending).toBe(false);
	});
	it('always writes in a fixed order', () => {
		expect(buildDescription({ ctx: 'perso', pending: false, start: '2026-01-02', end: '2026-03-04' }, 'x')).toBe(
			'[ctx:perso]\n[start:2026-01-02]\n[end:2026-03-04]\nx'
		);
	});
	it('changes one setting without touching the others', () => {
		const d = withMeta('[ctx:pro]\n[pending]\nhello', { pending: false, start: '2026-10-08' });
		expect(d).toBe('[ctx:pro]\n[start:2026-10-08]\nhello');
		expect(withMeta(d, { end: '2026-12-02' })).toBe('[ctx:pro]\n[start:2026-10-08]\n[end:2026-12-02]\nhello');
	});
	it('works together with the type helpers', () => {
		const d = withMeta('notes', { pending: true });
		expect(projectOwnType({ description: descriptionWithType(d, 'Pro') })).toBe('Pro');
		expect(descriptionWithType(d, 'Pro')).toBe('[ctx:pro]\n[pending]\nnotes');
		expect(descriptionWithType(descriptionWithType(d, 'Pro'), null)).toBe('[pending]\nnotes');
		expect(descriptionWithoutType('[ctx:pro]\n[pending]\nnotes')).toBe('notes');
	});
	it('formats the local date', () => {
		expect(today(new Date(2026, 9, 8))).toBe('2026-10-08');
	});
});
