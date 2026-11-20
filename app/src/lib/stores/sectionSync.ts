// Keeps sections (and your own task order) the same on all your devices (10 Nov 2026), through
// your Vikunja account's settings: a local change is sent a few seconds later; other devices
// apply it at their next sync. See utils/sectionMap.ts.
import { api } from '../api/client';
import { updateFrontendSettings } from '../api/userSettings';
import { getToken } from '../api/config';
import { isConfigured } from '../api/config';
import { db } from '../db/schema';
import { snapshot, toApply, type SectionMap } from '../utils/sectionMap';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
const KEY = 'tasks_sections';
const SEEN = 'tasks_sections_seen';

let applying = false;
// Projects changed here and not yet saved in the account. Kept on the device too (13 Nov 2026): a
// change made just before the page was closed or reloaded was lost with the 3-second timer.
const DIRTY = 'tasks_sections_dirty';
const dirty = new Set<string>(readDirty());
function readDirty(): string[] {
	try {
		return typeof localStorage === 'undefined' ? [] : (JSON.parse(localStorage.getItem(DIRTY) ?? '[]') ?? []);
	} catch {
		return [];
	}
}
function writeDirty() {
	try {
		localStorage.setItem(DIRTY, JSON.stringify([...dirty]));
	} catch {
		/* kept in memory */
	}
}
let timer: ReturnType<typeof setTimeout> | null = null;

function readSeen(): Record<string, number> {
	try {
		return JSON.parse(localStorage.getItem(SEEN) ?? '{}') ?? {};
	} catch {
		return {};
	}
}
function writeSeen(s: Record<string, number>) {
	try {
		localStorage.setItem(SEEN, JSON.stringify(s));
	} catch {
		/* applied again next time */
	}
}

export function markSectionsChanged(projectId: number | undefined | null): void {
	if (applying || projectId == null || typeof window === 'undefined') return;
	dirty.add(String(projectId));
	writeDirty();
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => void pushSections(), 3000);
}

async function getSettings(): Promise<UserSettings | null> {
	if (!isConfigured()) return null;
	try {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		return user.settings ?? null;
	} catch {
		return null;
	}
}

export async function pushSections(): Promise<void> {
	if (!dirty.size) return;
	const settings = await getSettings();
	if (!settings) {
		timer = setTimeout(() => void pushSections(), 60_000); // offline: later
		return;
	}
	const seen = readSeen();
	const sent = [...dirty];
	let stale = false;
	const recs = new Map<string, SectionMap[string] | null>();
	for (const pid of sent) {
		const id = Number(pid);
		recs.set(pid, snapshot(await db.sections.where('project_id').equals(id).toArray(), await db.tasks.where('project_id').equals(id).toArray()));
	}
	try {
		// Written into a fresh copy of the account's settings (see api/userSettings.ts).
		await updateFrontendSettings((fs) => {
			const map: SectionMap = { ...((fs[KEY] as SectionMap) ?? {}) };
			for (const [pid, rec] of recs) {
				// The account has a newer version than this device has seen: this device must take it
				// first, never write over it (13 Nov 2026: a device that had not received Lou's
				// sections yet sent "no sections" for that project and wiped them everywhere).
				if (map[pid] && (seen[pid] ?? 0) < map[pid].u) {
					stale = true;
					continue;
				}
				if (rec) {
					map[pid] = rec;
					seen[pid] = rec.u;
				} else if (map[pid]) {
					map[pid] = { u: Date.now(), s: [], a: {}, o: {} };
					seen[pid] = map[pid].u;
				}
			}
			return { ...fs, [KEY]: map };
		});
		for (const pid of sent) dirty.delete(pid);
		writeDirty();
		writeSeen(seen);
		if (stale) void pullSections();
	} catch {
		timer = setTimeout(() => void pushSections(), 60_000);
	}
}

/** Applies what other devices changed; the first time, also sends this device's own sections. */
export async function pullSections(): Promise<void> {
	const settings = await getSettings();
	if (!settings) return;
	const map = (settings.frontend_settings?.[KEY] as SectionMap) ?? {};
	const seen = readSeen();
	const first = localStorage.getItem(SEEN) === null;
	const todo = toApply(map, seen, dirty);
	if (todo.length) {
		applying = true;
		try {
			for (const pid of todo) {
				const id = Number(pid);
				const rec = map[pid];
				await db.transaction('rw', db.sections, db.tasks, async () => {
					await db.sections.where('project_id').equals(id).delete();
					for (const [sid, title, position] of rec.s) await db.sections.put({ id: sid, project_id: id, title, position });
					const valid = new Set(rec.s.map(([sid]) => sid));
					for (const t of await db.tasks.where('project_id').equals(id).toArray()) {
						const a = rec.a[String(t.id)];
						const section_id = a != null && valid.has(a) ? a : null;
						const local_order = rec.o[String(t.id)];
						if ((t.section_id ?? null) !== section_id || t.local_order !== local_order) await db.tasks.update(t.id, { section_id, local_order });
					}
				});
				seen[pid] = rec.u;
			}
		} finally {
			applying = false;
		}
		writeSeen(seen);
	}
	if (first) {
		// This device's own sections from before (10 Nov 2026), for the projects the account does not have yet.
		for (const s of await db.sections.toArray()) if (!map[String(s.project_id)]) dirty.add(String(s.project_id));
		writeSeen(seen);
		if (dirty.size) markSectionsChanged(Number([...dirty][0]));
	}
}

// Sections put back from a backup by Claude (13 Nov 2026), offered by the PC for this account only
// (serve_app.py, /sections-restore). Written into the account for the projects that have no
// sections there any more, once per restore.
const RESTORED = 'tasks_sections_restored';
export async function applySectionRestore(): Promise<void> {
	if (typeof window === 'undefined' || !isConfigured()) return;
	let r: { id?: string; projects?: SectionMap } = {};
	try {
		const token = getToken();
		const res = await fetch('/sections-restore', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
		if (!res.ok) return;
		r = await res.json();
	} catch {
		return;
	}
	if (!r.id || !r.projects || localStorage.getItem(RESTORED) === r.id) return;
	const projects = r.projects;
	try {
		await updateFrontendSettings((fs) => {
			const map: SectionMap = { ...((fs[KEY] as SectionMap) ?? {}) };
			let changed = false;
			for (const [pid, rec] of Object.entries(projects)) {
				if (map[pid] && map[pid].s.length) continue; // sections there again: left alone
				map[pid] = { ...rec, u: Date.now() };
				changed = true;
			}
			return changed ? { ...fs, [KEY]: map } : undefined;
		});
		localStorage.setItem(RESTORED, r.id);
		await pullSections();
	} catch {
		/* next time */
	}
}

let hooked = false;
/** Watches local changes to sections and to the task fields they use. */
export function watchSections(): void {
	if (hooked || typeof window === 'undefined') return;
	hooked = true;
	// Left over from a page closed before it could save: saved now.
	if (dirty.size) timer = setTimeout(() => void pushSections(), 3000);
	// Leaving the page: saved at once rather than in 3 seconds.
	const flush = () => {
		if (!dirty.size) return;
		if (timer) clearTimeout(timer);
		void pushSections();
	};
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
	db.sections.hook('creating', (_k, obj) => markSectionsChanged(obj.project_id));
	db.sections.hook('updating', (_m, _k, obj) => markSectionsChanged(obj.project_id));
	db.sections.hook('deleting', (_k, obj) => markSectionsChanged(obj?.project_id));
	db.tasks.hook('updating', (mods, _k, obj) => {
		const m = mods as Record<string, unknown>;
		if ('section_id' in m || 'local_order' in m) markSectionsChanged(obj.project_id);
		if ('project_id' in m && (obj.section_id != null || obj.local_order != null)) markSectionsChanged(obj.project_id);
	});
	db.tasks.hook('creating', (_k, obj) => {
		if (obj.id > 0 && (obj.section_id != null || obj.local_order != null)) markSectionsChanged(obj.project_id);
	});
}
