// "My filter" on the home page: a filter you build yourself, every criterion combined with AND.
// Pure functions here (tested in selfFilter.test.ts); the bar is SelfFilterBar.svelte.
import type { VikunjaTask, VikunjaProject } from '../types';
import { hasDate } from './dates';

export type DueChoice = 'any' | 'overdue' | 'today' | 'week' | 'dated' | 'none' | 'range';

export interface SelfFilter {
	text: string; // in the title, description, label names or project name; accents and case ignored
	withLabels: number[]; // the task has ALL of these (or ANY of them, with labelMode 'any')
	labelMode: 'all' | 'any';
	withoutLabels: number[]; // and NONE of these
	projectId: number | null; // this project or any of its sub-projects
	due: DueChoice;
	from: string; // YYYY-MM-DD, for due = 'range' (inclusive)
	to: string;
}

export const EMPTY_FILTER: SelfFilter = { text: '', withLabels: [], labelMode: 'all', withoutLabels: [], projectId: null, due: 'any', from: '', to: '' };

export function isActive(f: SelfFilter): boolean {
	return (
		f.text.trim() !== '' ||
		f.withLabels.length > 0 ||
		f.withoutLabels.length > 0 ||
		f.projectId !== null ||
		(f.due !== 'any' && (f.due !== 'range' || f.from !== '' || f.to !== ''))
	);
}

export function norm(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/<[^>]*>/g, ' ')
		.toLowerCase();
}

function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayFromInput(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
}

const DAY = 24 * 60 * 60 * 1000;

function dueMatches(task: VikunjaTask, f: SelfFilter, now: Date): boolean {
	if (f.due === 'any') return true;
	const has = hasDate(task.due_date);
	if (f.due === 'none') return !has;
	if (!has) return false;
	if (f.due === 'dated') return true;
	const due = new Date(task.due_date as string).getTime();
	const today = startOfDay(now);
	switch (f.due) {
		case 'overdue':
			return due < today;
		case 'today':
			return due >= today && due < today + DAY;
		case 'week': // from today to the end of the 7th day, overdue excluded
			return due >= today && due < today + 7 * DAY;
		case 'range': {
			const from = dayFromInput(f.from);
			const to = dayFromInput(f.to);
			return (from === null || due >= from) && (to === null || due < to + DAY);
		}
	}
	return true;
}

/** Ids of a project and of everything nested under it. */
export function projectAndChildren(id: number, projects: VikunjaProject[]): Set<number> {
	const out = new Set([id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of projects) {
			if (p.parent_project_id && out.has(p.parent_project_id) && !out.has(p.id)) {
				out.add(p.id);
				grew = true;
			}
		}
	}
	return out;
}

export function matchSelfFilter(task: VikunjaTask, f: SelfFilter, projects: VikunjaProject[], now = new Date()): boolean {
	const ids = new Set((task.labels ?? []).map((l) => l.id));
	if (f.withLabels.length && !(f.labelMode === 'any' ? f.withLabels.some((id) => ids.has(id)) : f.withLabels.every((id) => ids.has(id)))) return false;
	if (f.withoutLabels.some((id) => ids.has(id))) return false;
	if (f.projectId !== null && !projectAndChildren(f.projectId, projects).has(task.project_id)) return false;
	if (!dueMatches(task, f, now)) return false;
	const words = norm(f.text).split(/\s+/).filter(Boolean);
	if (words.length) {
		// What you type finds the task by its title, notes, labels or project (25 Oct 2026).
		const project = projects.find((p) => p.id === task.project_id)?.title ?? '';
		const labels = (task.labels ?? []).map((l) => l.title).join(' ');
		const hay = norm(`${task.title} ${task.description ?? ''} ${labels} ${project}`);
		if (!words.every((w) => hay.includes(w))) return false; // every word, in any order
	}
	return true;
}

/** Reads a saved filter, tolerating older or damaged data. */
export function parseSelfFilter(raw: string | null): SelfFilter {
	try {
		const v = JSON.parse(raw ?? '');
		const nums = (a: unknown) => (Array.isArray(a) ? a.filter((x) => Number.isInteger(x)) : []);
		const due = ['any', 'overdue', 'today', 'week', 'dated', 'none', 'range'].includes(v?.due) ? v.due : 'any';
		return {
			text: typeof v?.text === 'string' ? v.text : '',
			withLabels: nums(v?.withLabels),
			labelMode: v?.labelMode === 'any' ? 'any' : 'all',
			withoutLabels: nums(v?.withoutLabels),
			projectId: Number.isInteger(v?.projectId) ? v.projectId : null,
			due,
			from: typeof v?.from === 'string' ? v.from : '',
			to: typeof v?.to === 'string' ? v.to : ''
		};
	} catch {
		return { ...EMPTY_FILTER };
	}
}
