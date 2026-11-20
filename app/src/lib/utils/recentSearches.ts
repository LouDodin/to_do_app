// The last 10 search results the user opened, remembered on this device.
const KEY = 'recentSearchResults';
export const MAX_RECENT = 10;

export interface RecentResult {
	kind: string;
	id: number;
	label: string;
}

export function addRecent(list: RecentResult[], r: RecentResult): RecentResult[] {
	return [r, ...list.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, MAX_RECENT);
}

export function loadRecent(): RecentResult[] {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(v)
			? v
					.filter((x) => x && typeof x.kind === 'string' && typeof x.id === 'number' && typeof x.label === 'string')
					.slice(0, MAX_RECENT)
			: [];
	} catch {
		return [];
	}
}

export function saveRecent(r: RecentResult): RecentResult[] {
	const next = addRecent(loadRecent(), r);
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* storage unavailable */
	}
	return next;
}
