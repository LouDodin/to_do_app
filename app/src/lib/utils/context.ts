import { withMeta, parseDescription } from './projectMeta';
// "Context" (Pro / Perso) is a setting of a PROJECT (see projectMeta.ts) and applies to the
// whole tree under it. A task has no context of its own: it follows its project. A task is
// well defined as soon as it sits in a project other than the Inbox.
import type { VikunjaProject, VikunjaTask } from '../types';

export type Context = 'Pro' | 'Perso';
export const CONTEXTS: Context[] = ['Pro', 'Perso'];

// Validation status (redone 19 Oct 2026). A task is in the Inbox view until YOU validate it:
// validating puts the hidden label "ctx:validated" on it, and nothing else ever does. A task
// without that mark is "to validate", whatever you change in it, so a lost mark brings a task
// back to the Inbox instead of making it vanish.
// Before that day the opposite was stored: "ctx:review" on tasks still to validate. Until this
// account's one-time marking has run (statusMigration.ts), a task without either label counts
// as validated the old way.
export const VALIDATED_LABEL = 'ctx:validated';
export const REVIEW_LABEL = 'ctx:review'; // the old marker, still read until the marking has run
// Pending (10 Nov 2026): a task on hold. Hidden label; the task stays in its project (shown
// paused, at the end) but leaves the home page, the reviews and the suggestions until resumed.
export const PENDING_LABEL = 'ctx:pending';
// Abandoned (11 Nov 2026): closed without being done; it should not be done any more. The task is
// marked done (it leaves every list) and carries this hidden label, so it is never counted as done.
export const ABANDONED_LABEL = 'ctx:abandoned';
// Ongoing (20 Nov 2026, Lou #582): started and still in progress. Hidden label; the task shows in
// its own block at the top of the home page, and first among the tasks to consider in the reviews.
export const ONGOING_LABEL = 'ctx:ongoing';

const STATUS_KEY = 'tasks_status_v2';
let statusV2 = (() => {
	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem(STATUS_KEY) === '1';
	} catch {
		return false;
	}
})();
/** True once this account's existing validated tasks carry the "validated" mark. */
export function validatedMarkInUse(): boolean {
	return statusV2;
}
export function setValidatedMarkInUse(on: boolean): void {
	statusV2 = on;
	try {
		if (on) localStorage.setItem(STATUS_KEY, '1');
		else localStorage.removeItem(STATUS_KEY);
	} catch {
		// kept for this session only
	}
}

// Hidden marker labels: the status marks, and the old per-task context labels (removed from
// the server by a one-time clean-up, hidden until then).
export function isContextLabel(l: { title: string }): boolean {
	const t = l.title.toLowerCase();
	return t === 'ctx:pro' || t === 'ctx:perso' || t === REVIEW_LABEL || t === VALIDATED_LABEL || t === PENDING_LABEL || t === ABANDONED_LABEL || t === ONGOING_LABEL;
}

const hasLabel = (task: { labels?: { title: string }[] }, name: string) =>
	(task.labels ?? []).some((l) => l.title.toLowerCase() === name);

/** Validated by you. */
export function isValidated(task: { labels?: { title: string }[] }): boolean {
	if (hasLabel(task, VALIDATED_LABEL)) return true;
	if (statusV2) return false;
	return !hasLabel(task, REVIEW_LABEL); // the old way, until the one-time marking
}

/** Closed without being done (see ABANDONED_LABEL). */
export function isAbandoned(task: { labels?: { title: string }[] }): boolean {
	return hasLabel(task, ABANDONED_LABEL);
}

/** On hold (see PENDING_LABEL). */
export function isTaskPending(task: { labels?: { title: string }[] }): boolean {
	return hasLabel(task, PENDING_LABEL);
}

/** In progress (see ONGOING_LABEL). */
export function isOngoing(task: { labels?: { title: string }[] }): boolean {
	return hasLabel(task, ONGOING_LABEL);
}

/** Still to validate (the opposite of isValidated). */
export function inReview(task: { labels?: { title: string }[] }): boolean {
	return !isValidated(task);
}

export function visibleLabels<T extends { title: string }>(labels: T[] | undefined): T[] {
	return (labels ?? []).filter((l) => !isContextLabel(l));
}

export function rootProjectTitle(projectId: number, byId: Map<number, VikunjaProject>): string | null {
	let p = byId.get(projectId);
	let guard = 0;
	while (p && p.parent_project_id && byId.has(p.parent_project_id) && guard++ < 20) {
		p = byId.get(p.parent_project_id);
	}
	return p?.title ?? null;
}

// A project's type is a setting, stored as a hidden first line of its description:
// "[ctx:pro]" or "[ctx:perso]". It applies to the whole project tree below it; the
// highest project that has one decides.
const PROJECT_TYPE_RE = /^\s*\[ctx:(pro|perso)\]\s*\n?/i;

export function projectOwnType(p: { description?: string } | undefined): Context | null {
	const m = p?.description?.match(PROJECT_TYPE_RE);
	return m ? (m[1].toLowerCase() === 'pro' ? 'Pro' : 'Perso') : null;
}

export function descriptionWithType(description: string | undefined, ctx: Context | null): string {
	return withMeta(description, { ctx: ctx ? (ctx.toLowerCase() as 'pro' | 'perso') : null });
}

// The user's own text, without any of the hidden setting lines.
export function descriptionWithoutType(description: string | undefined): string {
	return parseDescription(description).rest;
}

// The project that decides a project's type (the highest one carrying a setting), or null.
export function typeSource(projectId: number, byId: Map<number, VikunjaProject>): VikunjaProject | null {
	let p = byId.get(projectId);
	let found: VikunjaProject | null = null;
	let guard = 0;
	while (p && guard++ < 20) {
		if (projectOwnType(p)) found = p;
		p = p.parent_project_id ? byId.get(p.parent_project_id) : undefined;
	}
	return found;
}

export function inferredContext(projectId: number, byId: Map<number, VikunjaProject>): Context | null {
	const src = typeSource(projectId, byId);
	if (src) return projectOwnType(src);
	// Older setup: a top-level folder literally called Pro / Perso.
	const title = rootProjectTitle(projectId, byId)?.trim().toLowerCase();
	if (title === 'pro') return 'Pro';
	if (title === 'perso') return 'Perso';
	return null;
}

export function taskContext(task: VikunjaTask, byId: Map<number, VikunjaProject>): Context | null {
	return inferredContext(task.project_id, byId);
}

// The Inbox project is where a task with "no project" lives.
export function isInboxProject(projectId: number, byId: Map<number, VikunjaProject>): boolean {
	const p = byId.get(projectId);
	return p ? p.title.toLowerCase() === 'inbox' && !p.parent_project_id : projectId === 1;
}

export type View = 'input' | 'all' | 'Pro' | 'Perso';

// Whether a task belongs in the given top-bar view. A task still being
// reviewed counts as Input only, whatever context it has been given.
export function inView(task: VikunjaTask, byId: Map<number, VikunjaProject>, view: View): boolean {
	// A task still waiting for validation, or with no project yet, belongs in the Inbox view.
	// A completed task has left the Inbox (completing it there validates it).
	// Tasks of an archived project are left alone (the project is finished).
	const needsWork =
		!task.done && !byId.get(task.project_id)?.is_archived && (inReview(task) || isInboxProject(task.project_id, byId));
	if (view === 'input') return needsWork;
	if (needsWork) return false;
	const c = taskContext(task, byId);
	if (view === 'all') return true;
	return c === view;
}


// "overdue" and "last-day" follow the due date (the Mac automation re-adds them within a minute),
// so removing one while the date still calls for it is pointless. Returns the reason, or null.
export function dueLabelLock(
	task: { due_date?: string | null; done?: boolean },
	labelTitle: string,
	now: Date = new Date()
): string | null {
	const t = labelTitle.trim().toLowerCase();
	if (t !== 'overdue' && t !== 'last-day') return null;
	if (task.done || !task.due_date || task.due_date.startsWith('0001')) return null;
	const due = new Date(task.due_date);
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	if (t === 'overdue' && day(due) < day(now)) return 'This task is overdue. Change its due date to remove the label.';
	if (t === 'last-day' && day(due) === day(now)) return 'This task is due today. Change its due date to remove the label.';
	return null;
}
