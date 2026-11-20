// Undo and redo (5 Nov 2026, task "add the possibility to undo the last actions, and redo them").
// Every change you make to tasks (complete, move, labels, rename, dates, Bin, sections, order…) is
// remembered as "how the tasks were before" and "how they were after". Undo puts the tasks back as
// they were before, redo as they were after, with the same actions as by hand (so it is synced to
// the server like any change). Kept for this visit of the app: the last 50 changes.
import { db } from '../db/schema';
import { remappedId } from '../db/idRemap';
import type { VikunjaTask } from '../types';

type Snap = {
	id: number;
	inBin: boolean;
	title: string;
	description?: string;
	done: boolean;
	due_date?: string | null;
	start_date?: string | null;
	priority?: number;
	repeat_after?: number;
	repeat_mode?: number;
	project_id: number;
	labelIds: number[];
	section_id?: number | null;
	local_order?: number;
} | null;
type Entry = { label: string; ids: number[]; before: Snap[]; after: Snap[] };

const LIMIT = 50;
export const history = $state({ undo: [] as Entry[], redo: [] as Entry[], busy: false });

let depth = 0; // only the outermost action is remembered (an action made of several others is one step)
let replaying = false;
const live = (id: number) => remappedId(id) ?? id;

async function snap(id: number): Promise<Snap> {
	id = live(id);
	const t = (await db.tasks.get(id)) ?? (await db.bin.get(id));
	if (!t) return null;
	const inBin = !(await db.tasks.get(id));
	return {
		id,
		inBin,
		title: t.title,
		description: t.description,
		done: !!t.done,
		due_date: t.due_date ?? null,
		start_date: t.start_date ?? null,
		priority: t.priority,
		repeat_after: t.repeat_after,
		repeat_mode: t.repeat_mode,
		project_id: t.project_id,
		labelIds: (t.labels ?? []).map((l) => l.id).sort((a, b) => a - b),
		section_id: t.section_id ?? null,
		local_order: t.local_order
	};
}

/** Runs a change to these tasks and remembers it for Undo. */
export async function recorded<T>(label: string, ids: number[], fn: () => Promise<T>): Promise<T> {
	if (replaying || depth > 0) {
		depth++;
		try {
			return await fn();
		} finally {
			depth--;
		}
	}
	depth++;
	let before: Snap[] = [];
	try {
		before = await Promise.all(ids.map(snap));
	} catch {
		before = [];
	}
	try {
		return await fn();
	} finally {
		depth--;
		try {
			const after = await Promise.all(ids.map(snap));
			if (before.length && JSON.stringify(before) !== JSON.stringify(after)) {
				history.undo = [...history.undo, { label, ids: ids.map(live), before, after }].slice(-LIMIT);
				history.redo = [];
			}
		} catch {
			/* not remembered */
		}
	}
}

/** Runs the creation of a task and remembers it (Undo puts it in the Bin, Redo brings it back). */
export async function rememberCreated(label: string, fn: () => Promise<number>): Promise<number> {
	if (replaying || depth > 0) return fn();
	depth++;
	let id = 0;
	try {
		id = await fn();
		return id;
	} finally {
		depth--;
		if (id) {
			try {
				const after = await snap(id);
				history.undo = [...history.undo, { label, ids: [id], before: [null], after: [after] }].slice(-LIMIT);
				history.redo = [];
			} catch {
				/* not remembered */
			}
		}
	}
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Brings one task to a remembered state, with the usual actions. */
async function apply(target: Snap, id: number): Promise<void> {
	const tasks = await import('../actions/tasks');
	const bin = await import('../actions/bin');
	id = live(target?.id ?? id);
	let cur = await snap(id);
	if (!target) {
		// It did not exist / was not there: nothing sensible to do but put it in the Bin.
		if (cur && !cur.inBin) await tasks.deleteTask(id, { quiet: true });
		return;
	}
	if (target.inBin) {
		if (cur && !cur.inBin) await tasks.deleteTask(id, { quiet: true });
		return;
	}
	if (cur?.inBin) {
		await bin.restoreFromBin(id, target.project_id);
		cur = await snap(id);
	}
	if (!cur) return;
	const patch: Partial<VikunjaTask> = {};
	for (const k of ['title', 'description', 'due_date', 'start_date', 'priority', 'repeat_after', 'repeat_mode', 'project_id'] as const) {
		if (!same(cur[k], target[k])) (patch as Record<string, unknown>)[k] = target[k];
	}
	if (Object.keys(patch).length) await tasks.updateTask(id, patch);
	if (cur.done !== target.done) await tasks.updateTask(id, { done: target.done, done_at: target.done ? new Date().toISOString() : null });
	if (!same(cur.labelIds, target.labelIds)) await tasks.setTaskLabels(id, target.labelIds);
	if (cur.section_id !== target.section_id || cur.local_order !== target.local_order)
		await db.tasks.update(id, { section_id: target.section_id ?? null, local_order: target.local_order });
}

async function replay(entry: Entry, which: 'before' | 'after') {
	replaying = true;
	history.busy = true;
	try {
		const states = entry[which];
		for (let i = 0; i < entry.ids.length; i++) await apply(states[i], entry.ids[i]);
	} finally {
		replaying = false;
		history.busy = false;
	}
}

export async function undo(): Promise<string | null> {
	const entry = history.undo.at(-1);
	if (!entry || history.busy) return null;
	history.undo = history.undo.slice(0, -1);
	await replay(entry, 'before');
	history.redo = [...history.redo, entry];
	return entry.label;
}

export async function redo(): Promise<string | null> {
	const entry = history.redo.at(-1);
	if (!entry || history.busy) return null;
	history.redo = history.redo.slice(0, -1);
	await replay(entry, 'after');
	history.undo = [...history.undo, entry];
	return entry.label;
}
