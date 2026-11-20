import { describe, it, expect } from 'vitest';
import { duplicateInput, relationsToCopy } from './taskCopy';
const L = (id: number, title: string) => ({ id, title }) as any;
describe('duplicateInput', () => {
	const t = { id: 1, title: 'A', done: true, project_id: 7, description: 'notes', start_date: '0001-01-01T00:00:00Z', due_date: '2026-10-10T10:00:00Z', priority: 3, labels: [L(1, 'overdue'), L(2, 'next-action'), L(3, 'ctx:pro'), L(4, 'last-day')], related_tasks: { precedes: [{ id: 9, title: 'x', done: false }], follows: [{ id: 8, title: 'y', done: true }], subtask: [{ id: 5, title: 'z', done: false }] } } as any;
	it('keeps project, description, dates, priority and every label', () => {
		const c = duplicateInput(t);
		expect(c.project_id).toBe(7);
		expect(c.description).toBe('notes');
		expect(c.start_date).toBe('0001-01-01T00:00:00Z');
		expect(c.due_date).toBe('2026-10-10T10:00:00Z');
		expect(c.priority).toBe(3);
		expect(c.label_ids).toEqual([1, 2, 3, 4]);
	});
	it('copies precedes / follows links', () => {
		expect(relationsToCopy(t)).toEqual([['precedes', 9], ['follows', 8]]);
	});
	it('a task with no due date stays without one', () => {
		expect(duplicateInput({ ...t, due_date: '0001-01-01T00:00:00Z' }).due_date).toBeNull();
	});
});

import { copyTitle } from './taskCopy';
describe('copyTitle', () => {
	it('adds _2, then _3, and never repeats a name', () => {
		expect(copyTitle('Buy milk', ['Buy milk'])).toBe('Buy milk_2');
		expect(copyTitle('Buy milk', ['Buy milk', 'Buy milk_2'])).toBe('Buy milk_3');
		expect(copyTitle('Buy milk_2', ['Buy milk', 'Buy milk_2'])).toBe('Buy milk_3');
		expect(copyTitle('Buy milk', ['buy milk_2'])).toBe('Buy milk_3');
		expect(copyTitle('Report 2024', [])).toBe('Report 2024_2');
	});
});
