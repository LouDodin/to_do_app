import { describe, it, expect, afterEach } from 'vitest';
import { inView, isValidated, setValidatedMarkInUse } from './context';
import { tasksToMark, oldFlagFixes } from './statusMark';

const L = (id: number, title: string) => ({ id, title }) as any;
const P = (id: number, title: string, extra: any = {}) => ({ id, title, parent_project_id: 0, ...extra }) as any;
const projects = [P(1, 'INBOX'), P(2, 'Work'), P(3, 'Bin'), P(4, 'Old', { is_archived: true })];
const byId = new Map(projects.map((p) => [p.id, p]));
const T = (o: any) => ({ id: 10, title: 't', project_id: 2, done: false, labels: [], ...o }) as any;

describe('validation status', () => {
	afterEach(() => setValidatedMarkInUse(false));
	it('before the one-time marking: the old rule (no "to validate" flag = validated)', () => {
		expect(isValidated(T({}))).toBe(true);
		expect(isValidated(T({ labels: [L(5, 'ctx:review')] }))).toBe(false);
		expect(isValidated(T({ labels: [L(6, 'ctx:validated')] }))).toBe(true);
	});
	it('after it: only the "validated" mark counts; a task without it is in the Inbox', () => {
		setValidatedMarkInUse(true);
		expect(inView(T({}), byId, 'input')).toBe(true);
		expect(inView(T({ labels: [L(6, 'ctx:validated')] }), byId, 'input')).toBe(false);
		expect(inView(T({ labels: [L(6, 'ctx:validated')] }), byId, 'all')).toBe(true);
		// in the Inbox project: always to validate
		expect(inView(T({ project_id: 1, labels: [L(6, 'ctx:validated')] }), byId, 'input')).toBe(true);
		// completed, or in an archived project: not in the Inbox
		expect(inView(T({ done: true }), byId, 'input')).toBe(false);
		expect(inView(T({ project_id: 4 }), byId, 'input')).toBe(false);
	});
	it('the one-time marking: only open tasks validated the old way', () => {
		const ts = [
			T({ id: 1 }),
			T({ id: 2, labels: [L(5, 'ctx:review')] }),
			T({ id: 3, project_id: 1 }),
			T({ id: 4, done: true }),
			T({ id: 5, project_id: 3 }),
			T({ id: 6, project_id: 4 }),
			T({ id: 7, labels: [L(6, 'ctx:validated')] })
		];
		expect(tasksToMark(ts, projects).map((t) => t.id)).toEqual([1]);
	});
	it('keeps the old flag right for older app versions', () => {
		const ts = [
			T({ id: 1 }), // to validate, outside the Inbox, no old flag: add it
			T({ id: 2, labels: [L(5, 'ctx:review')] }), // fine
			T({ id: 3, project_id: 1 }), // in the Inbox project: those versions see it anyway
			T({ id: 4, labels: [L(6, 'ctx:validated'), L(5, 'ctx:review')] }), // validated: remove the old flag
			T({ id: 5, labels: [L(6, 'ctx:validated')] }), // fine
			T({ id: 6, done: true }) // completed: left alone
		];
		const r = oldFlagFixes(ts, projects);
		expect(r.add.map((t) => t.id)).toEqual([1]);
		expect(r.remove.map((t) => t.id)).toEqual([4]);
	});
});
