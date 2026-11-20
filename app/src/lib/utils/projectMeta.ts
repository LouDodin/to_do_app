// A project's settings that Vikunja has no field for live in hidden lines at the top of its
// description, so they follow the project to every device and the Mac automation can read them:
//   [ctx:pro]  [pending]  [start:2026-10-08]  [end:2026-12-02]
// They are always written in that order, one per line, before the user's own text.
export interface ProjectMeta {
	ctx: 'pro' | 'perso' | null;
	pending: boolean;
	start: string | null; // YYYY-MM-DD, set when a pending project is started
	end: string | null; // YYYY-MM-DD, set when a project is archived
}

const LINE = /^[ \t]*\[(ctx:(?:pro|perso)|pending|start:\d{4}-\d{2}-\d{2}|end:\d{4}-\d{2}-\d{2})\][ \t]*(?:\r?\n|$)/i;

export function parseDescription(description: string | undefined): { meta: ProjectMeta; rest: string } {
	const meta: ProjectMeta = { ctx: null, pending: false, start: null, end: null };
	let rest = description ?? '';
	for (let i = 0; i < 8; i++) {
		const m = rest.match(LINE);
		if (!m) break;
		const tag = m[1].toLowerCase();
		if (tag.startsWith('ctx:')) meta.ctx = tag.slice(4) as 'pro' | 'perso';
		else if (tag === 'pending') meta.pending = true;
		else if (tag.startsWith('start:')) meta.start = tag.slice(6);
		else meta.end = tag.slice(4);
		rest = rest.slice(m[0].length);
	}
	return { meta, rest };
}

export function buildDescription(meta: ProjectMeta, rest: string): string {
	const lines: string[] = [];
	if (meta.ctx) lines.push(`[ctx:${meta.ctx}]`);
	if (meta.pending) lines.push('[pending]');
	if (meta.start) lines.push(`[start:${meta.start}]`);
	if (meta.end) lines.push(`[end:${meta.end}]`);
	return lines.length ? `${lines.join('\n')}\n${rest}` : rest;
}

export function withMeta(description: string | undefined, patch: Partial<ProjectMeta>): string {
	const { meta, rest } = parseDescription(description);
	return buildDescription({ ...meta, ...patch }, rest);
}

export function projectMeta(p: { description?: string } | undefined): ProjectMeta {
	return parseDescription(p?.description).meta;
}

// Local calendar date, e.g. 2026-10-08.
export function today(now = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}
