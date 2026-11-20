import { describe, it, expect } from 'vitest';
import { inView, REVIEW_LABEL } from './context';

const P = (id: number, title: string, parent = 0) => ({ id, title, parent_project_id: parent }) as any;
const byId = new Map([[1, P(1, 'Pro')], [2, P(2, 'Perso')], [3, P(3, 'Inbox')], [4, P(4, 'Sub', 1)]].map(([k, v]: any) => [k, v]));
const T = (o: any) => ({ id: 1, title: 't', done: false, project_id: 4, labels: [], ...o });

describe('inView', () => {
	it('all shows everything', () => expect(inView(T({}), byId, 'all')).toBe(true));
	it('task in Pro tree is Pro, not Perso, not Inbox', () => {
		expect(inView(T({}), byId, 'Pro')).toBe(true);
		expect(inView(T({}), byId, 'Perso')).toBe(false);
		expect(inView(T({}), byId, 'input')).toBe(false);
	});
	it('review marker sends it to Inbox only', () => {
		const t = T({ labels: [{ id: 9, title: REVIEW_LABEL }] });
		expect(inView(t, byId, 'input')).toBe(true);
		expect(inView(t, byId, 'Pro')).toBe(false);
	});
	it('task in Inbox project is Inbox', () => expect(inView(T({ project_id: 3 }), byId, 'input')).toBe(true));
	it('an old per-task context label no longer matters', () => {
		const t = T({ labels: [{ id: 8, title: 'ctx:perso' }] });
		expect(inView(t, byId, 'Pro')).toBe(true);
		expect(inView(t, byId, 'Perso')).toBe(false);
	});
});

import { dueLabelLock } from './context';
describe('dueLabelLock', () => {
	const now = new Date(2026, 9, 8, 12);
	it('locks overdue when the due date is past, not otherwise', () => {
		expect(dueLabelLock({ due_date: new Date(2026, 9, 7).toISOString() }, 'overdue', now)).toBeTruthy();
		expect(dueLabelLock({ due_date: new Date(2026, 9, 9).toISOString() }, 'overdue', now)).toBeNull();
		expect(dueLabelLock({ due_date: new Date(2026, 9, 7).toISOString(), done: true }, 'overdue', now)).toBeNull();
		expect(dueLabelLock({ due_date: '0001-01-01T00:00:00Z' }, 'overdue', now)).toBeNull();
	});
	it('locks last-day on the due day only', () => {
		expect(dueLabelLock({ due_date: new Date(2026, 9, 8, 18).toISOString() }, 'last-day', now)).toBeTruthy();
		expect(dueLabelLock({ due_date: new Date(2026, 9, 10).toISOString() }, 'last-day', now)).toBeNull();
		expect(dueLabelLock({ due_date: new Date(2026, 9, 8).toISOString() }, 'p1', now)).toBeNull();
	});
});

import { inferredContext, taskContext, isInboxProject, rootProjectTitle } from './context';
describe('project types and their subfolders', () => {
	const P2 = (id: number, title: string, parent = 0) => ({ id, title, parent_project_id: parent }) as any;
	const tree = new Map<number, any>(
		[P2(1, 'Pro'), P2(2, 'A', 1), P2(3, 'B', 2), P2(4, 'C', 3), P2(5, 'D', 4), P2(6, 'Perso'), P2(7, 'Loose'), P2(8, 'Sub of loose', 7), P2(9, 'Inbox')].map((p) => [p.id, p])
	);
	const T2 = (project_id: number, labels: any[] = []) => ({ id: 1, title: 't', done: false, project_id, labels }) as any;
	it('every depth inherits the type of the top-level project', () => {
		for (const id of [1, 2, 3, 4, 5]) expect(inferredContext(id, tree)).toBe('Pro');
		expect(inferredContext(6, tree)).toBe('Perso');
	});
	it('a folder with no type gives its subfolders no type either, but the task is still defined', () => {
		expect(inferredContext(7, tree)).toBeNull();
		expect(inferredContext(8, tree)).toBeNull();
		expect(inView(T2(8), tree, 'input')).toBe(false);
		expect(inView(T2(8), tree, 'all')).toBe(true);
		expect(inView(T2(8), tree, 'Pro')).toBe(false);
		expect(inView(T2(8), tree, 'Perso')).toBe(false);
	});
	it('a typed subfolder task is in its view only', () => {
		expect(inView(T2(5), tree, 'Pro')).toBe(true);
		expect(inView(T2(5), tree, 'Perso')).toBe(false);
		expect(inView(T2(5), tree, 'all')).toBe(true);
		expect(inView(T2(5), tree, 'input')).toBe(false);
	});
	it('a task awaiting validation stays in Inbox whatever its folder', () => {
		expect(inView(T2(5, [{ id: 1, title: REVIEW_LABEL }]), tree, 'Pro')).toBe(false);
		expect(inView(T2(5, [{ id: 1, title: REVIEW_LABEL }]), tree, 'input')).toBe(true);
	});
	it('a task takes the type of its project, nothing else', () => {
		expect(taskContext(T2(5, [{ id: 2, title: 'ctx:perso' }]), tree)).toBe('Pro');
		expect(taskContext(T2(8), tree)).toBeNull();
	});
	it('Inbox is only the top-level project', () => {
		expect(isInboxProject(9, tree)).toBe(true);
		const moved = new Map(tree); moved.set(9, P2(9, 'Inbox', 1));
		expect(isInboxProject(9, moved)).toBe(false);
	});
	it('survives a loop in the tree', () => {
		const loop = new Map<number, any>([[1, P2(1, 'X', 2)], [2, P2(2, 'Y', 1)]]);
		expect(() => rootProjectTitle(1, loop)).not.toThrow();
		expect(inferredContext(1, loop)).toBeNull();
	});
	it('case and spacing of the root name', () => {
		expect(inferredContext(1, new Map([[1, P2(1, 'PRO')]]))).toBe('Pro');
	});
});

import { projectOwnType, descriptionWithType, descriptionWithoutType, typeSource } from './context';
describe('project type as a setting', () => {
	const P3 = (id: number, parent = 0, description = '', title = 'p' + id) => ({ id, title, parent_project_id: parent, description }) as any;
	it('round-trips through the description and keeps the user text', () => {
		const d = descriptionWithType('My notes', 'Pro');
		expect(d).toBe('[ctx:pro]\nMy notes');
		expect(projectOwnType({ description: d })).toBe('Pro');
		expect(descriptionWithoutType(d)).toBe('My notes');
		expect(descriptionWithType(d, 'Perso')).toBe('[ctx:perso]\nMy notes');
		expect(descriptionWithType(d, null)).toBe('My notes');
		expect(projectOwnType({ description: 'nothing here [ctx:pro]' })).toBeNull();
	});
	it('the whole tree follows the highest project that has a setting', () => {
		const m = new Map<number, any>([[1, P3(1, 0, '[ctx:perso]\n')], [2, P3(2, 1)], [3, P3(3, 2, '[ctx:pro]\n')], [4, P3(4, 3)]].map(([k, v]: any) => [k, v]));
		for (const id of [1, 2, 3, 4]) expect(inferredContext(id, m)).toBe('Perso');
		expect(typeSource(4, m)?.id).toBe(1);
	});
	it('a folder merely named Pro below another folder is just a folder', () => {
		const m = new Map<number, any>([[1, P3(1, 0, '', 'Work')], [2, P3(2, 1, '', 'Pro')]].map(([k, v]: any) => [k, v]));
		expect(inferredContext(2, m)).toBeNull();
	});
	it('an untyped folder gets no type', () => expect(inferredContext(1, new Map([[1, P3(1)]]))).toBeNull());
});
