// Shared domain types. These mirror the shape of Vikunja's REST API closely
// enough to store directly in IndexedDB, plus a few fields we add locally
// for sync bookkeeping (see db/schema.ts).

export interface VikunjaLabel {
	id: number;
	title: string;
	hex_color: string; // without '#'
	created?: string;
	updated?: string;
}

export interface VikunjaProject {
	id: number;
	title: string;
	description?: string;
	parent_project_id?: number;
	is_archived?: boolean;
	hex_color?: string;
	position?: number;
	// Local-only metadata layer (not part of Vikunja's own schema) — see
	// db/pendingMeta.ts. Kept optional here so raw API objects still satisfy
	// this type before the metadata pass merges it in.
	is_pending?: boolean;
}

export interface VikunjaRelatedTask {
	relation_kind: 'precedes' | 'follows' | 'subtask' | 'parenttask' | string;
	task_id: number;
	other_task_id: number;
}

// A related task, as embedded in another task's `related_tasks` map. This is
// deliberately a lighter, non-self-referential summary (not the full
// VikunjaTask) — Dexie's `.update()`/`.modify()` derive a recursive key-path
// type from the table's row type, and a self-referential `related_tasks:
// Record<string, VikunjaTask[]>` makes that derivation loop forever. We only
// ever read title/done/id off related tasks in the UI, so this costs nothing.
export interface VikunjaRelatedTaskSummary {
	id: number;
	title: string;
	done: boolean;
}

export interface VikunjaTask {
	id: number;
	title: string;
	description?: string;
	done: boolean;
	done_at?: string | null;
	due_date?: string | null;
	start_date?: string | null;
	project_id: number;
	labels?: VikunjaLabel[];
	priority?: number;
	repeat_after?: number;
	repeat_mode?: number;
	// Reminders (19 Nov 2026): the PC sends a phone notification at that time (automations).
	reminders?: { reminder: string; relative_period?: number; relative_to?: string }[] | null;
	related_tasks?: Record<string, VikunjaRelatedTaskSummary[]>;
	created?: string;
	updated?: string;
	// Local-only: which section (within its project) this task belongs to.
	// Absent/null = unassigned.
	section_id?: number | null;
	// Local-only (5 Nov 2026): the order you dragged the tasks into, on a project's page.
	local_order?: number;
}

export interface VikunjaFilter {
	id: number;
	title: string;
	filters: {
		filter: string; // Vikunja filter DSL string
	};
}

// Local-only: sections inside a project (see spec "Page d'un projet").
// Vikunja has no native concept of this, so it's stored in our own table
// and never sent to the backend.
export interface Section {
	id: number; // locally generated
	project_id: number;
	title: string;
	position: number;
}

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
