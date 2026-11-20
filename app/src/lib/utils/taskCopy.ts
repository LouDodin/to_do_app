import type { VikunjaTask } from '../types';

const isZero = (d?: string | null) => !d || d.startsWith('0001');

const ZERO = '0001-01-01T00:00:00Z';

// What a duplicate of a task starts from: everything the same (project, description, dates,
// every label - the context ones included - and priority / repeat). An empty start date
// is sent as the "no date" value so it is not replaced by the creation time.
export function duplicateInput(original: VikunjaTask) {
	return {
		title: original.title,
		project_id: original.project_id,
		description: original.description || undefined,
		start_date: isZero(original.start_date) ? ZERO : original.start_date,
		due_date: isZero(original.due_date) ? null : original.due_date,
		label_ids: (original.labels ?? []).map((l) => l.id),
		priority: original.priority || undefined,
		repeat_after: original.repeat_after || undefined,
		repeat_mode: original.repeat_mode || undefined
	};
}

// "Buy milk" -> "Buy milk_2" (or _3, _4... if those exist): a copy never has the exact name of another task in its project.
export function copyTitle(title: string, existing: string[]): string {
	const base = title.replace(/_\d+$/, '');
	const taken = new Set(existing.map((t) => t.trim().toLowerCase()));
	let n = 2;
	while (taken.has(`${base}_${n}`.toLowerCase())) n++;
	return `${base}_${n}`;
}

// The links to copy: [kind, other task id] for the kinds the app can create.
export function relationsToCopy(original: VikunjaTask): ['precedes' | 'follows', number][] {
	const out: ['precedes' | 'follows', number][] = [];
	for (const kind of ['precedes', 'follows'] as const) {
		for (const r of original.related_tasks?.[kind] ?? []) out.push([kind, r.id]);
	}
	return out;
}
