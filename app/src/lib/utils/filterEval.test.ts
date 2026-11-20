import { describe, it, expect } from 'vitest';
import { compileFilter, makeResolver } from './filterEval';
import type { VikunjaTask } from '../types';

const L = (id: number, title: string) => ({ id, title, hex_color: '' }) as any;
const labels = [L(1, 'next-action'), L(2, 'overdue'), L(3, 'p1')];
const projects = [{ id: 10, title: 'Work', parent_project_id: 0 }] as any;
const t = (o: Partial<VikunjaTask>): VikunjaTask => ({ id: 1, title: 'x', done: false, project_id: 10, labels: [], ...o });
const names = makeResolver(labels, projects);

describe('filterEval', () => {
	it('matches by label id', () => {
		const f = compileFilter('labels in 1');
		expect(f(t({ labels: [labels[0]] }))).toBe(true);
		expect(f(t({}))).toBe(false);
	});
	it('matches by label name', () => {
		const f = compileFilter('labels in next-action, p1', names);
		expect(f(t({ labels: [labels[2]] }))).toBe(true);
		expect(f(t({ labels: [labels[1]] }))).toBe(false);
	});
	it('supports not in', () => {
		const f = compileFilter('labels not in overdue', names);
		expect(f(t({ labels: [labels[1]] }))).toBe(false);
		expect(f(t({}))).toBe(true);
	});
	it('matches by project name', () => {
		expect(compileFilter('project in Work', names)(t({}))).toBe(true);
		expect(compileFilter('project in Home', names)(t({}))).toBe(false);
	});
	it('handles && || and parentheses', () => {
		const f = compileFilter('done = false && (labels in 1 || labels in 3)', names);
		expect(f(t({ labels: [labels[0]] }))).toBe(true);
		expect(f(t({ labels: [labels[0]], done: true }))).toBe(false);
		expect(f(t({ labels: [labels[1]] }))).toBe(false);
	});
	it('date math with now', () => {
		const f = compileFilter('due_date < now');
		expect(f(t({ due_date: '2000-01-01T00:00:00Z' }))).toBe(true);
		expect(f(t({ due_date: '2999-01-01T00:00:00Z' }))).toBe(false);
		expect(compileFilter('due_date < now+1d')(t({ due_date: new Date(Date.now() + 3600e3).toISOString() }))).toBe(true);
	});
	it('does not throw on garbage', () => {
		expect(() => compileFilter('((( &&')(t({}))).not.toThrow();
		expect(() => compileFilter('')(t({}))).not.toThrow();
	});
});
