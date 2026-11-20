import type { VikunjaProject } from '../types';

export type DropWhere = 'before' | 'after' | 'inside';

const parentOf = (p: VikunjaProject): number => p.parent_project_id || 0;

// Creation order for projects that share a position: older (real) ids first, projects not yet
// saved on the server (negative temporary ids) after them, in the order they were made.
const creationKey = (p: VikunjaProject) => (p.id > 0 ? p.id : 1e12 - p.id);

/** Display order of sibling projects: saved position first, then creation order. Never alphabetical,
 *  so nothing moves by itself. */
export function compareProjects(a: VikunjaProject, b: VikunjaProject): number {
	return (a.position ?? 0) - (b.position ?? 0) || creationKey(a) - creationKey(b);
}

/** Position that puts a project last among the given siblings. */
export function positionAtEnd(siblings: VikunjaProject[]): number {
	return siblings.reduce((m, p) => Math.max(m, p.position ?? 0), 0) + 1;
}

/**
 * One-off: projects that never had a distinct position were shown alphabetically. Writing that
 * order down as positions keeps the list exactly as it looks now, and from then on nothing moves
 * unless the user moves it. Only groups containing ties are renumbered.
 */
export function freezePlan(projects: VikunjaProject[]): { id: number; position: number }[] {
	const groups = new Map<number, VikunjaProject[]>();
	for (const p of projects) {
		if (p.id <= 0 || p.is_archived) continue;
		const k = parentOf(p);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k)!.push(p);
	}
	const out: { id: number; position: number }[] = [];
	for (const list of groups.values()) {
		const positions = list.map((p) => p.position ?? 0);
		if (new Set(positions).size === positions.length && !positions.includes(0)) continue;
		const shown = [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
		shown.forEach((p, i) => {
			if ((p.position ?? 0) !== i + 1) out.push({ id: p.id, position: i + 1 });
		});
	}
	return out;
}

export function isDescendant(projects: VikunjaProject[], id: number, ancestorId: number): boolean {
	const byId = new Map(projects.map((p) => [p.id, p]));
	let cur = byId.get(id);
	let guard = 0;
	while (cur && guard++ < 50) {
		const parent = parentOf(cur);
		if (!parent) return false;
		if (parent === ancestorId) return true;
		cur = byId.get(parent);
	}
	return false;
}

export interface ProjectMove {
	/** New parent of the dragged project (0 = top level). */
	parent: number;
	/** Every project whose parent or position must be saved, with its new values. */
	updates: { id: number; parent: number; position: number }[];
}

/**
 * Where does a dropped project end up? Returns null when the drop is not allowed
 * (onto itself or into its own sub-tree). Siblings are renumbered 1, 2, 3… in their
 * new order so ties between projects that never had a position are settled.
 */
export function computeMove(
	projects: VikunjaProject[],
	dragId: number,
	targetId: number,
	where: DropWhere
): ProjectMove | null {
	const dragged = projects.find((p) => p.id === dragId);
	const target = projects.find((p) => p.id === targetId);
	if (!dragged || !target || dragId === targetId) return null;
	if (isDescendant(projects, targetId, dragId)) return null;

	const parent = where === 'inside' ? target.id : parentOf(target);
	const siblings = projects
		.filter((p) => parentOf(p) === parent && p.id !== dragId && p.id > 0 && !p.is_archived)
		.sort(compareProjects);
	let index = siblings.length; // 'inside' = last child
	if (where !== 'inside') {
		const at = siblings.findIndex((p) => p.id === targetId);
		index = where === 'before' ? at : at + 1;
	}
	const order = [...siblings.slice(0, index), dragged, ...siblings.slice(index)];
	const updates = order
		.map((p, i) => ({ id: p.id, parent, position: i + 1, was: p }))
		.filter((u) => u.id === dragId || u.was.position !== u.position || parentOf(u.was) !== u.parent)
		.map(({ id, parent, position }) => ({ id, parent, position }));
	return { parent, updates };
}

/** All projects in the order of the left panel: top-level ones (ranked by `rootRank`, e.g. Perso then
 *  Pro, stable otherwise), each followed by its sub-projects, depth first. `depth` is the nesting level. */
export function treeOrder(
	projects: VikunjaProject[],
	rootRank: (p: VikunjaProject) => number = () => 0
): { project: VikunjaProject; depth: number }[] {
	const ids = new Set(projects.map((p) => p.id));
	const kids = new Map<number, VikunjaProject[]>();
	for (const p of projects) {
		// A project whose parent is not in the list is shown at the top level.
		const key = ids.has(parentOf(p)) ? parentOf(p) : 0;
		(kids.get(key) ?? kids.set(key, []).get(key)!).push(p);
	}
	for (const list of kids.values()) list.sort(compareProjects);
	const out: { project: VikunjaProject; depth: number }[] = [];
	const walk = (parent: number, depth: number, seen: Set<number>) => {
		let list = kids.get(parent) ?? [];
		if (parent === 0) list = [...list].sort((a, b) => rootRank(a) - rootRank(b));
		for (const p of list) {
			if (seen.has(p.id)) continue;
			seen.add(p.id);
			out.push({ project: p, depth });
			walk(p.id, depth + 1, seen);
		}
	};
	walk(0, 0, new Set());
	return out;
}
