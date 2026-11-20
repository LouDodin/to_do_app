import { describe, it, expect } from 'vitest';
import { tasksCsv, completeJson, projectPath } from './exportData';

const projects = [
	{ id: 1, title: 'PERSO' },
	{ id: 2, title: 'Gifts; Xmas', parent_project_id: 1 }
] as never[];
const tasks = [
	{ id: 10, title: 'Buy "the" book', project_id: 2, done: false, due_date: '2026-11-02T10:00:00Z', labels: [{ id: 1, title: 'dad', hex_color: '' }, { id: 2, title: 'ctx:validated', hex_color: '' }], description: '<p>Ask&nbsp;Paul</p><p>then go</p>' },
	{ id: 11, title: 'Done thing', project_id: 1, done: true, due_date: '0001-01-01T00:00:00Z' }
] as never[];
const bin = [{ id: 12, title: 'Old', project_id: 1, done: false }] as never[];
const input = { tasks, bin, projects, labels: [{ id: 1, title: 'dad', hex_color: 'f00' }] as never[], filters: [], build: 'b', now: new Date('2026-10-26T10:00:00Z') };

describe('download my data', () => {
	it('project path', () => {
		expect(projectPath(2, projects)).toBe('PERSO / Gifts; Xmas');
	});
	it('csv: one row per task (Bin included), Excel-ready', () => {
		const csv = tasksCsv(input);
		expect(csv.startsWith('﻿Title;Project;Labels;Done;Due')).toBe(true);
		const lines = csv.trim().split('\r\n');
		expect(lines).toHaveLength(4);
		const book = lines.find((l) => l.startsWith('"Buy'))!;
		expect(book).toContain('"Buy ""the"" book";"PERSO / Gifts; Xmas";dad;;2026-11-02');
		expect(book).not.toContain('ctx:validated'); // the app's hidden marks are left out
		expect(book).toContain('"Ask Paul\nthen go"');
		expect(lines.find((l) => l.startsWith('Old'))).toContain(';yes;'); // in the Bin
		expect(lines.find((l) => l.startsWith('Done thing'))).toContain('PERSO;;yes;;');
	});
	it('json: everything, with counts', () => {
		const j = JSON.parse(completeJson(input));
		expect(j.counts).toEqual({ tasks: 2, bin: 1, projects: 2, labels: 1, filters: 0 });
		expect(j.tasks[0].labels).toHaveLength(2);
		expect(j.exported).toBe('2026-10-26T10:00:00.000Z');
	});
});
