import { describe, it, expect } from 'vitest';
import { NEWS, unseenNews, searchNews, highlight } from './news';

describe('news', () => {
	it('newest first, unique ids', () => {
		const ids = NEWS.map((n) => n.id);
		expect([...ids].sort().reverse()).toEqual(ids);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('a new device sees only the latest entry', () => {
		expect(unseenNews(null)).toEqual([NEWS[0]]);
	});
	it('an updated device sees what came after its last one', () => {
		expect(unseenNews(NEWS[2].id)).toEqual([NEWS[0], NEWS[1]]);
		expect(unseenNews(NEWS[0].id)).toEqual([]);
	});
});

describe('searching the updates', () => {
	const list = [
		{ id: 'b', date: '6 Nov 2026', title: 'Shopping and undo', items: ['A shopping list', 'Undo with Ctrl+Z', 'Sections reordered'] },
		{ id: 'a', date: '19 Oct 2026', title: 'Validation', items: ['Validate in the Inbox', 'Créé un raccourci'] }
	];
	it('nothing typed: everything', () => {
		expect(searchNews('  ', list)).toEqual(list);
	});
	it('keeps only the lines that mention the word', () => {
		expect(searchNews('undo', list)).toEqual([{ ...list[0], items: list[0].items }]); // in the title: all lines
		expect(searchNews('sections', list)).toEqual([{ ...list[0], items: ['Sections reordered'] }]);
	});
	it('every word must appear in the update; case and accents ignored', () => {
		expect(searchNews('INBOX validate', list).map((n) => n.id)).toEqual(['a']);
		expect(searchNews('cree', list)[0].items).toEqual(['Créé un raccourci']);
		expect(searchNews('inbox shopping', list)).toEqual([]);
	});
	it('a date finds its update', () => {
		expect(searchNews('19 oct', list).map((n) => n.id)).toEqual(['a']);
	});
	it('highlights what was typed, accents included', () => {
		expect(highlight('Créé un raccourci', 'cree')).toEqual([
			{ t: 'Créé', hit: true },
			{ t: ' un raccourci', hit: false }
		]);
		expect(highlight('Undo or undo', 'UNDO').filter((p) => p.hit).length).toBe(2);
	});
});
