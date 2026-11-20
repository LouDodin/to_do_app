// Sections and your own task order, shared by all your devices (10 Nov 2026: "on the phone app
// we don't see the sections in the projects": they lived only on the device that made them).
// One record per project, kept in your Vikunja account (user settings): the newest wins.
export type SectionRecord = {
	u: number; // when it was last changed (ms)
	s: [number, string, number][]; // sections: id, title, position
	a: Record<string, number>; // task id -> section id
	o: Record<string, number>; // task id -> your order
};
export type SectionMap = Record<string, SectionRecord>;

export function snapshot(
	sections: { id: number; title: string; position: number }[],
	tasks: { id: number; section_id?: number | null; local_order?: number }[],
	now = Date.now()
): SectionRecord | null {
	const ids = new Set(sections.map((s) => s.id));
	const a: Record<string, number> = {};
	const o: Record<string, number> = {};
	for (const t of tasks) {
		if (t.id <= 0) continue; // not on the server yet: sent once it is
		if (t.section_id != null && ids.has(t.section_id)) a[t.id] = t.section_id;
		if (t.local_order != null) o[t.id] = t.local_order;
	}
	if (!sections.length && !Object.keys(o).length) return null;
	return { u: now, s: sections.map((s) => [s.id, s.title, s.position]), a, o };
}

/** Which projects of the account's map are newer than what this device applied. */
export function toApply(remote: SectionMap, seen: Record<string, number>, dirty: Set<string>): string[] {
	return Object.keys(remote).filter((pid) => !dirty.has(pid) && remote[pid] && remote[pid].u > (seen[pid] ?? 0));
}

/** A new section id that no other device will pick (negative, so never a Vikunja id). */
export function newSectionId(existing: number[]): number {
	let id = -(Date.now() * 100 + Math.floor(Math.random() * 100));
	while (existing.includes(id)) id--;
	return id;
}
