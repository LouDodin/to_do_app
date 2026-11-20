// Several labels at once (11 Nov 2026, asked by Lou Canava): /label/12+15 shows the tasks with
// labels 12 and 15 (all of them; ?any=1: any of them). In the menu, a label adds itself to the
// labels shown, or takes itself off; from any other page it opens its own list.

/** The label ids of a /label/… address ("12+15" → [12, 15]). */
export function parseLabelIds(param: string | undefined): number[] {
	return [...new Set((param ?? '').split(/[+,\s]/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Where a click on a label of the menu leads, from the page being shown. */
export function labelHref(id: number, pathname: string, search = ''): string {
	const m = pathname.match(/^\/label\/([^/]+)$/);
	if (!m) return `/label/${id}`;
	const ids = parseLabelIds(decodeURIComponent(m[1]));
	const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
	if (!next.length) return '/';
	const any = new URLSearchParams(search).get('any') === '1' && next.length > 1 ? '?any=1' : '';
	return `/label/${next.join('+')}${any}`;
}

/** Tasks carrying all the labels (or any of them). */
export function matchesLabels(task: { labels?: { id: number }[] | null }, ids: number[], any = false): boolean {
	if (!ids.length) return false;
	const has = new Set((task.labels ?? []).map((l) => l.id));
	return any ? ids.some((i) => has.has(i)) : ids.every((i) => has.has(i));
}
