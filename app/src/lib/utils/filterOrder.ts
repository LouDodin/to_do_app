// Display names and ordering of saved filters.
import type { VikunjaFilter } from '../types';

// "7. Groceries" -> "Groceries". Titles that are only a number are left alone.
export function cleanFilterTitle(title: string): string {
	const t = title.replace(/^\s*\d+\s*[.)\-:–]+\s*/, '').trim();
	return t || title.trim();
}

export function leadingNumber(title: string): number | null {
	const m = title.match(/^\s*(\d+)\s*[.)\-:–]/);
	return m ? Number(m[1]) : null;
}

// The order filters were shown in before it was saved: by their old number (if any), then by
// name. Only used once, to write that order down so it never changes by itself.
export function legacyOrder(filters: VikunjaFilter[]): VikunjaFilter[] {
	return [...filters].sort((a, b) => {
		const na = leadingNumber(a.title) ?? Infinity, nb = leadingNumber(b.title) ?? Infinity;
		if (na !== nb) return na === Infinity ? 1 : nb === Infinity ? -1 : na - nb;
		return cleanFilterTitle(a.title).localeCompare(cleanFilterTitle(b.title));
	});
}

// Creation order: saved filters by id, ones not yet on the server (negative temporary ids) after.
const creationKey = (f: VikunjaFilter) => (f.id > 0 ? f.id : 1e12 - f.id);

// Filters listed in `saved` come first, in that order; any other filter follows in the order it
// was made, so a new filter is always at the bottom and nothing is sorted by name.
export function orderFilters(filters: VikunjaFilter[], saved: number[]): VikunjaFilter[] {
	const pos = new Map(saved.map((id, i) => [id, i]));
	const rank = (f: VikunjaFilter) => (pos.has(f.id) ? pos.get(f.id)! : Infinity);
	return [...filters].sort((a, b) => {
		const ra = rank(a), rb = rank(b);
		if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
		return creationKey(a) - creationKey(b);
	});
}

export function moveInOrder(ids: number[], from: number, to: number): number[] {
	const next = [...ids];
	const [x] = next.splice(from, 1);
	next.splice(to, 0, x);
	return next;
}
