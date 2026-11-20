// Default colour order from the spec ("Tri et paramétrage des labels"),
// top to bottom. User-editable via Settings — see stores/settings.ts.
export const DEFAULT_COLOR_ORDER = [
	'000000',
	'ff473d',
	'5f5ff6',
	'6abe8e',
	'c194ff',
	'ffad66',
	'ffd152',
	'ffadce',
	'69c1f7'
];

import type { VikunjaLabel } from '../types';

function normalizeHex(hex: string): string {
	return hex.replace('#', '').toLowerCase();
}

/**
 * Sort labels by colour rank first (per the configured order; a colour not
 * in the list sorts last, per spec), then alphabetically within a colour.
 */
export function sortLabels(labels: VikunjaLabel[], colorOrder: string[] = DEFAULT_COLOR_ORDER): VikunjaLabel[] {
	const rank = new Map(colorOrder.map((c, i) => [normalizeHex(c), i]));
	const unknownRank = colorOrder.length; // unknown colours sort after every known one
	return [...labels].sort((a, b) => {
		const ra = rank.get(normalizeHex(a.hex_color)) ?? unknownRank;
		const rb = rank.get(normalizeHex(b.hex_color)) ?? unknownRank;
		if (ra !== rb) return ra - rb;
		return a.title.localeCompare(b.title);
	});
}
