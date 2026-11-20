// Several tasks selected at once (5 Nov 2026; redesigned 11 Nov 2026). Each row has a tick box on
// its left (shown on hover on a computer, always once something is selected; on the phone, "Select"
// in a task's long-press menu). While a selection exists, a click anywhere on a row only adds or
// removes it: nothing else on the row reacts, so no property is changed by mistake. Shift-click
// selects a range; Ctrl/⌘-click still works. Esc, the × of the bar, or a click on an empty part of
// the page clears. The bar at the bottom acts on all of them.
export const multiSelect = $state({
	ids: [] as number[],
	anchorList: null as number | null,
	anchorId: null as number | null,
	// The tasks shown by each list on the page, in order (for Shift-click and "Select all").
	lists: {} as Record<number, number[]>
});

export function registerList(listId: number, ids: number[]): void {
	multiSelect.lists[listId] = ids;
}
export function unregisterList(listId: number): void {
	delete multiSelect.lists[listId];
}
/** Every task of the list being selected in (all lists of the page when none yet). */
export function selectableIds(): number[] {
	const l = multiSelect.anchorList;
	if (l !== null && multiSelect.lists[l]) return multiSelect.lists[l];
	return [...new Set(Object.values(multiSelect.lists).flat())];
}
export function selectAll(): void {
	multiSelect.ids = [...new Set([...multiSelect.ids, ...selectableIds()])];
}

export function isMultiSelected(id: number): boolean {
	return multiSelect.ids.includes(id);
}
export function toggleMulti(id: number, listId: number, alsoId?: number | null): void {
	// The first Ctrl-click also takes the task that was selected by a plain click before.
	if (!multiSelect.ids.length && alsoId && alsoId !== id) multiSelect.ids = [alsoId];
	multiSelect.ids = multiSelect.ids.includes(id) ? multiSelect.ids.filter((x) => x !== id) : [...multiSelect.ids, id];
	multiSelect.anchorList = listId;
	multiSelect.anchorId = id;
}
export function rangeMulti(id: number, listId: number, ordered: number[]): void {
	const from = multiSelect.anchorList === listId && multiSelect.anchorId !== null ? ordered.indexOf(multiSelect.anchorId) : -1;
	const to = ordered.indexOf(id);
	if (from < 0 || to < 0) return toggleMulti(id, listId);
	const [a, b] = from < to ? [from, to] : [to, from];
	const add = ordered.slice(a, b + 1);
	multiSelect.ids = [...new Set([...multiSelect.ids, ...add])];
}
export function setAnchor(id: number, listId: number): void {
	multiSelect.anchorList = listId;
	multiSelect.anchorId = id;
}
export function clearMulti(): void {
	multiSelect.ids = [];
	multiSelect.anchorId = null;
}

/** Ids carried by a drag: all the selected tasks when the dragged one is part of the selection. */
export function draggedIds(e: DragEvent): number[] {
	const many = e.dataTransfer?.getData('application/x-task-ids');
	if (many) {
		try {
			const ids = JSON.parse(many);
			if (Array.isArray(ids) && ids.length) return ids.map(Number).filter(Boolean);
		} catch {
			/* single task below */
		}
	}
	const one = Number(e.dataTransfer?.getData('application/x-task-id'));
	return one ? [one] : [];
}

// The sections of the project page being shown (sections live on each device), so the bar can
// offer "Move to a section".
export const pageSections = $state({ projectId: 0, list: [] as { id: number; title: string }[] });
