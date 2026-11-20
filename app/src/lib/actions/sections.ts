import { db } from '../db/schema';
import type { Section } from '../types';
import { newSectionId } from '../utils/sectionMap';

// Sections are layered on top of Vikunja projects (see spec "Page d'un projet"): nothing here
// goes through the sync queue. Since 10 Nov 2026 they are shared by all your devices through
// your account's settings (stores/sectionSync.ts, which watches these tables).

// Section ids are negative local numbers. The counter used to restart at
// -1 on every page load, so a section created after a reload could reuse
// the id of an existing one and overwrite it. Always continue below the
// lowest id already stored instead.
// 10 Nov 2026: ids made from the time, so two devices never make the same one.
async function nextSectionId(): Promise<number> {
	const all = await db.sections.toArray();
	return newSectionId(all.map((s) => s.id));
}

export async function createSection(projectId: number, title: string): Promise<number> {
	const existing = await db.sections.where('project_id').equals(projectId).toArray();
	const id = await nextSectionId();
	const section: Section = {
		id,
		project_id: projectId,
		title,
		position: existing.length
	};
	await db.sections.put(section);
	return id;
}

export async function renameSection(id: number, title: string): Promise<void> {
	await db.sections.update(id, { title });
}

export async function deleteSection(id: number): Promise<void> {
	// Tasks in the deleted section fall back to "Unassigned", per spec.
	const tasks = await db.tasks.where('section_id').equals(id).toArray();
	await db.transaction('rw', db.tasks, db.sections, async () => {
		for (const t of tasks) {
			await db.tasks.update(t.id, { section_id: null });
		}
		await db.sections.delete(id);
	});
}

export async function reorderSections(projectId: number, orderedIds: number[]): Promise<void> {
	await db.transaction('rw', db.sections, async () => {
		for (let i = 0; i < orderedIds.length; i++) {
			await db.sections.update(orderedIds[i], { position: i });
		}
	});
}
