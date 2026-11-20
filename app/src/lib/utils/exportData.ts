// "Download my data" (26 Oct 2026): a copy of the signed-in account's data, made from what this
// device holds, so it works with the PC off and never contains anyone else's data.
//  - a table for Excel or Numbers (one row per task)
//  - a complete file (everything the app knows), to restore from if ever needed
import type { VikunjaLabel, VikunjaProject, VikunjaTask } from '../types';
import { hasDate } from './dates';
import { isContextLabel } from './context';

export interface ExportInput {
	tasks: VikunjaTask[];
	bin: VikunjaTask[];
	projects: VikunjaProject[];
	labels: VikunjaLabel[];
	filters: unknown[];
	build: string;
	now?: Date;
}

/** "Parent / Child / Project" */
export function projectPath(id: number, projects: VikunjaProject[]): string {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const parts: string[] = [];
	let p = byId.get(id);
	for (let i = 0; p && i < 20; i++) {
		parts.unshift(p.title);
		p = p.parent_project_id ? byId.get(p.parent_project_id) : undefined;
	}
	return parts.join(' / ');
}

const day = (iso?: string | null) => (hasDate(iso) ? new Date(iso as string).toISOString().slice(0, 10) : '');
const plain = (html?: string) =>
	(html ?? '')
		.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();

// Semicolons: what Excel expects in French (and most European) settings. The BOM makes it read
// accents correctly.
const SEP = ';';
function cell(v: string | number | boolean): string {
	const s = String(v);
	return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tasksCsv(input: ExportInput): string {
	const head = ['Title', 'Project', 'Labels', 'Done', 'Due', 'Start', 'Repeats', 'In the Bin', 'Created', 'Updated', 'Notes', 'Id'];
	const rows = [
		...input.tasks.map((t) => ({ t, bin: false })),
		...input.bin.map((t) => ({ t, bin: true }))
	]
		.filter(({ t }) => t.id > 0 || t.title)
		.sort((a, b) => projectPath(a.t.project_id, input.projects).localeCompare(projectPath(b.t.project_id, input.projects)) || a.t.title.localeCompare(b.t.title))
		.map(({ t, bin }) => [
			t.title,
			projectPath(t.project_id, input.projects),
			(t.labels ?? []).filter((l) => !isContextLabel(l)).map((l) => l.title).join(', '),
			t.done ? 'yes' : '',
			day(t.due_date),
			day(t.start_date),
			t.repeat_after ? `every ${Math.round(t.repeat_after / 86400)} day(s)` : t.repeat_mode === 1 ? 'monthly' : '',
			bin ? 'yes' : '',
			day(t.created),
			day(t.updated),
			plain(t.description),
			t.id
		]);
	return '﻿' + [head, ...rows].map((r) => r.map(cell).join(SEP)).join('\r\n') + '\r\n';
}

export function completeJson(input: ExportInput): string {
	const now = input.now ?? new Date();
	return JSON.stringify(
		{
			what: 'Tasks app: complete copy of one account (tasks, Bin, projects, labels, saved filters)',
			exported: now.toISOString(),
			app_build: input.build,
			counts: { tasks: input.tasks.length, bin: input.bin.length, projects: input.projects.length, labels: input.labels.length, filters: input.filters.length },
			tasks: input.tasks,
			bin: input.bin,
			projects: input.projects,
			labels: input.labels,
			filters: input.filters
		},
		null,
		1
	);
}

export const fileStamp = (now = new Date()) =>
	`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
