import { describe, it, expect } from 'vitest';
import { alreadyDone } from './alreadyDone';

describe('alreadyDone', () => {
	it('counts what is already the case as done', () => {
		expect(alreadyDone('delete', 404, 'This project does not exist.')).toBe(true);
		expect(alreadyDone('addRelation', 409, 'The task relation already exists.')).toBe(true);
		expect(alreadyDone('addLabel', 400, 'This label already exists on the task.')).toBe(true);
		expect(alreadyDone('removeRelation', 404, 'The task relation does not exist.')).toBe(true);
	});
	it('a real refusal stays a refusal', () => {
		expect(alreadyDone('update', 412, 'This project is archived. Editing or creating new tasks is not possible.')).toBe(false);
		expect(alreadyDone('update', 404, 'This task does not exist.')).toBe(false);
		expect(alreadyDone('create', 409, 'already exists')).toBe(false);
		expect(alreadyDone('delete', 403, 'Forbidden')).toBe(false);
		expect(alreadyDone('addRelation', 400, 'Invalid relation kind')).toBe(false);
	});
});
