import { api } from './client';
import type { VikunjaTask, VikunjaProject, VikunjaLabel, VikunjaFilter } from '../types';

// Thin wrappers over Vikunja's REST API (https://vikunja.io/docs/api/).
// Nothing here touches IndexedDB — the sync engine (db/sync.ts) is the
// only caller, so all offline/queueing logic stays in one place.

export const tasksApi = {
	// The "all tasks" endpoint used by the sync engine's full pull.
	// `pending` (our own field) never round-trips to Vikunja itself, but is
	// preserved locally by the sync engine's merge step.
	//
	// Some Vikunja deployments (confirmed on v2.6.0) reject `/api/v1/tasks/all`
	// outright — with or without a filter — with a generic 400 "Invalid model
	// provided". The plain `/api/v1/tasks` endpoint works everywhere and is
	// paginated (`max_items_per_page`, 50 on most instances), so we page
	// through it ourselves until a short page tells us we've reached the end.
	allSince: async (updatedSince?: string) => {
		const filter = updatedSince ? `?filter=${encodeURIComponent(`updated >= '${updatedSince}'`)}` : '';
		return api.getAll<VikunjaTask>(`/api/v1/tasks${filter}`);
	},
	create: (projectId: number, task: Partial<VikunjaTask>) =>
		api.put<VikunjaTask>(`/api/v1/projects/${projectId}/tasks`, task),
	update: (id: number, patch: Partial<VikunjaTask>) => api.post<VikunjaTask>(`/api/v1/tasks/${id}`, patch),
	delete: (id: number) => api.delete<void>(`/api/v1/tasks/${id}`),
	// Makes the task's label set match `labelIds` by reading what the server
	// has and adding / removing only the difference, one label at a time
	// (the single-label endpoints are the reliable ones).
	// One label added or removed (19 Oct 2026): only that change is sent, so a device holding an
	// older copy of the task can never wipe labels it did not know about. Already there / already
	// gone counts as done.
	addLabel: async (taskId: number, labelId: number) => {
		try {
			await api.put(`/api/v1/tasks/${taskId}/labels`, { label_id: labelId });
		} catch (e) {
			const has = ((await api.get<VikunjaTask>(`/api/v1/tasks/${taskId}`)).labels ?? []).some((l) => l.id === labelId);
			if (!has) throw e;
		}
	},
	removeLabel: async (taskId: number, labelId: number) => {
		try {
			await api.delete(`/api/v1/tasks/${taskId}/labels/${labelId}`);
		} catch (e) {
			const has = ((await api.get<VikunjaTask>(`/api/v1/tasks/${taskId}`)).labels ?? []).some((l) => l.id === labelId);
			if (has) throw e;
		}
	},
	setLabels: async (taskId: number, labelIds: number[]) => {
		const want = new Set(labelIds);
		const read = async () =>
			new Set(((await api.get<VikunjaTask>(`/api/v1/tasks/${taskId}`)).labels ?? []).map((l) => l.id));
		let have = await read();
		// 1. One bulk request for the whole set (fast, atomic on the server).
		if (![...want].every((id) => have.has(id)) || ![...have].every((id) => want.has(id))) {
			try {
				await api.post(`/api/v1/tasks/${taskId}/labels/bulk`, { labels: labelIds.map((id) => ({ id })) });
			} catch {
				/* fall through to the one-by-one path */
			}
			have = await read();
		}
		// 2. One at a time, never stopping at the first failure, then verify and retry once.
		let lastError: unknown = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			for (const id of want) {
				if (have.has(id)) continue;
				try {
					await api.put(`/api/v1/tasks/${taskId}/labels`, { label_id: id });
				} catch (e) {
					lastError = e;
				}
			}
			for (const id of have) {
				if (want.has(id)) continue;
				try {
					await api.delete(`/api/v1/tasks/${taskId}/labels/${id}`);
				} catch (e) {
					lastError = e;
				}
			}
			have = await read();
			if ([...want].every((id) => have.has(id)) && [...have].every((id) => want.has(id))) return;
		}
		throw lastError ?? new Error('Labels could not be synced');
	},
	addRelation: (taskId: number, otherTaskId: number, kind: 'precedes' | 'follows') =>
		api.put(`/api/v1/tasks/${taskId}/relations`, {
			relation_kind: kind,
			other_task_id: otherTaskId
		}),
	removeRelation: (taskId: number, kind: string, otherTaskId: number) =>
		api.delete(`/api/v1/tasks/${taskId}/relations/${kind}/${otherTaskId}`)
};

export const projectsApi = {
	all: () => api.getAll<VikunjaProject>('/api/v1/projects?is_archived=true'),
	create: (project: Partial<VikunjaProject>) => api.put<VikunjaProject>('/api/v1/projects', project),
	update: (id: number, patch: Partial<VikunjaProject>) =>
		api.post<VikunjaProject>(`/api/v1/projects/${id}`, patch),
	delete: (id: number) => api.delete<void>(`/api/v1/projects/${id}`)
};

export const labelsApi = {
	all: () => api.getAll<VikunjaLabel>('/api/v1/labels'),
	create: (label: { title: string; hex_color: string }) => api.put<VikunjaLabel>('/api/v1/labels', label),
	update: (id: number, patch: Partial<VikunjaLabel>) => api.post<VikunjaLabel>(`/api/v1/labels/${id}`, patch),
	delete: (id: number) => api.delete<void>(`/api/v1/labels/${id}`)
};

export const filtersApi = {
	list: () => api.get<VikunjaFilter[]>('/api/v1/filters'),
	get: (id: number) => api.get<VikunjaFilter>(`/api/v1/filters/${id}`),
	create: (filter: { title: string; filters: { filter: string } }) =>
		api.put<VikunjaFilter>('/api/v1/filters', filter),
	update: (id: number, patch: Partial<VikunjaFilter>) => api.post<VikunjaFilter>(`/api/v1/filters/${id}`, patch),
	delete: (id: number) => api.delete<void>(`/api/v1/filters/${id}`),
	tasksMatching: (filterString: string) =>
		api.get<VikunjaTask[]>(`/api/v1/tasks/all?filter=${encodeURIComponent(filterString)}`)
};
