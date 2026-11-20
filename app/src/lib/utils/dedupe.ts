// Finding (and describing how to merge) duplicate labels, projects and saved
// filters. Everything here is pure: it only looks at data and returns what
// should be kept and what should go, so it can be tested without a server.
import { isBinProject } from './bin';
import { cleanFilterTitle, leadingNumber } from './filterOrder';
import type { VikunjaFilter, VikunjaLabel, VikunjaProject } from '../types';

export interface DuplicateGroup<T> {
	keep: T; // the oldest (lowest id) is kept
	remove: T[];
}

// Case, accents, emoji and spacing are ignored: "Today", " today " and "Today 🔥"
// are the same name. Symbols and digits are kept, so "<60" and ">60" stay different.
export const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

function groupBy<T>(items: T[], key: (t: T) => string | null): T[][] {
	const m = new Map<string, T[]>();
	for (const it of items) {
		const k = key(it);
		if (k === null) continue;
		m.set(k, [...(m.get(k) ?? []), it]);
	}
	return [...m.values()].filter((g) => g.length > 1);
}

function toGroup<T extends { id: number }>(g: T[]): DuplicateGroup<T> {
	const sorted = [...g].sort((a, b) => a.id - b.id);
	return { keep: sorted[0], remove: sorted.slice(1) };
}

// Hidden context labels are managed by the app itself and count like any other.
export function findDuplicateLabels(labels: VikunjaLabel[]): DuplicateGroup<VikunjaLabel>[] {
	return groupBy(labels.filter((l) => l.id > 0), (l) => norm(l.title)).map(toGroup);
}

// Same name AND same parent. Saved-filter pseudo-projects (negative ids) are ignored.
export function findDuplicateProjects(projects: VikunjaProject[]): DuplicateGroup<VikunjaProject>[] {
	return groupBy(
		projects.filter((p) => p.id > 0 && !p.is_archived && !isBinProject(p)),
		(p) => `${p.parent_project_id ?? 0}::${norm(p.title)}`
	).map(toGroup);
}

// Normalises a filter string so two filters can be compared: lists of ids
// are sorted and de-duplicated, spacing is ignored.
export function normaliseFilter(filter: string): string {
	return filter
		.replace(/\b(labels|project_id|project)\s+(not\s+in|in)\s+([^&|()]+)/gi, (_m, field, op, list) => {
			const items = String(list)
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean);
			const uniq = [...new Set(items.map((v) => (isNaN(Number(v)) ? v.toLowerCase() : v)))];
			uniq.sort((a, b) => (isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)));
			return `${field} ${op.toLowerCase().replace(/\s+/g, ' ')} ${uniq.join(', ')} `;
		})
		.replace(/\s+/g, ' ')
		.replace(/\s*(&&|\|\|)\s*/g, ' $1 ')
		.replace(/\(\s+/g, '(')
		.replace(/\s+\)/g, ')')
		.trim();
}

// Rewrites label ids inside a filter (e.g. after merging duplicate labels),
// removing any id that ends up listed twice.
export function remapFilterIds(filter: string, field: 'labels' | 'project_id', idMap: Map<number, number>): string {
	const re = new RegExp(`\\b(${field})\\s+(not\\s+in|in)\\s+([^&|()]+)`, 'gi');
	return filter.replace(re, (_m, f, op, list) => {
		const items = String(list)
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean)
			.map((v) => (!isNaN(Number(v)) && idMap.has(Number(v)) ? String(idMap.get(Number(v))) : v));
		return `${f} ${op} ${[...new Set(items)].join(', ')} `;
	}).replace(/\s+$/, (m) => (m ? '' : m));
}

export interface FilterDuplicates {
	// extra copies that can safely go: identical, unnumbered next to a numbered one, or pointing at things that no longer exist
	identical: DuplicateGroup<VikunjaFilter>[];
	// same name, different working definitions: needs a human decision
	conflicting: VikunjaFilter[][];
}

export interface KnownIds {
	labelIds: Set<number>;
	projectIds: Set<number>;
}

// True when a filter mentions label / project ids that don't exist any more.
export function hasDanglingRefs(filter: string, known?: KnownIds): boolean {
	if (!known) return false;
	const re = /\b(labels|project_id|project)\s+(?:not\s+in|in)\s+([^&|()]+)/gi;
	for (const m of filter.matchAll(re)) {
		const isLabel = m[1].toLowerCase() === 'labels';
		for (const v of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
			if (isNaN(Number(v))) continue; // names are resolved by the app
			if (!(isLabel ? known.labelIds : known.projectIds).has(Number(v))) return true;
		}
	}
	return false;
}

export function findDuplicateFilters(filters: VikunjaFilter[], known?: KnownIds): FilterDuplicates {
	const out: FilterDuplicates = { identical: [], conflicting: [] };
	for (const g of groupBy(filters.filter((f) => f.id > 0), (f) => norm(cleanFilterTitle(f.title)))) {
		const numbered = (f: VikunjaFilter) => leadingNumber(f.title) !== null;
		const broken = (f: VikunjaFilter) => hasDanglingRefs(f.filters.filter, known);
		const sorted = [...g].sort(
			(a, b) =>
				Number(numbered(b)) - Number(numbered(a)) ||
				Number(broken(a)) - Number(broken(b)) ||
				a.id - b.id
		);
		const keep = sorted[0];
		const remove = sorted.slice(1);
		const safe = remove.every(
			(f) =>
				normaliseFilter(f.filters.filter) === normaliseFilter(keep.filters.filter) ||
				(numbered(keep) && !numbered(f)) ||
				(broken(f) && !broken(keep))
		);
		if (safe) out.identical.push({ keep, remove });
		else out.conflicting.push(sorted);
	}
	return out;
}
