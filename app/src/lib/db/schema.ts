import Dexie, { type Table } from 'dexie';
import type { VikunjaTask, VikunjaProject, VikunjaLabel, VikunjaFilter, Section } from '../types';

// A queued local write, replayed against the API once back online.
// `entity`/`op` together decide which endpoint to call on replay
// (see db/sync.ts#replayQueue).
export interface QueuedWrite {
	id?: number; // autoincrement
	entity: 'task' | 'project' | 'label' | 'filter' | 'section';
	op: 'create' | 'update' | 'delete' | 'setLabels' | 'addLabel' | 'removeLabel' | 'addRelation' | 'removeRelation';
	// For 'create', targetId is a temporary negative local id until the
	// server assigns a real one (see sync.ts#reconcileCreatedId).
	targetId: number;
	payload: unknown;
	createdAt: number;
}

export class AppDB extends Dexie {
	tasks!: Table<VikunjaTask, number>;
	projects!: Table<VikunjaProject, number>;
	labels!: Table<VikunjaLabel, number>;
	filters!: Table<VikunjaFilter, number>;
	sections!: Table<Section, number>;
	// Tasks in the Bin: kept apart from `tasks` so no view, count or report ever sees them.
	bin!: Table<VikunjaTask, number>;
	queue!: Table<QueuedWrite, number>;
	// Single-row table holding sync bookkeeping (last successful pull time, etc).
	meta!: Table<{ key: string; value: unknown }, string>;

	constructor() {
		super('vikunja-frontend');
		this.version(1).stores({
			tasks: 'id, project_id, done, due_date, start_date, section_id',
			projects: 'id, parent_project_id, is_pending',
			labels: 'id, title, hex_color',
			filters: 'id',
			sections: 'id, project_id, position',
			queue: '++id, entity, createdAt',
			meta: 'key'
		});
		this.version(2).stores({ bin: 'id, project_id' });
	}
}

export const db = new AppDB();
