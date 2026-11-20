// Svelte action: calls `onOutside` on any click that lands outside `node`.
// Used to make every popover/dropdown in the app dismiss itself when the
// user clicks elsewhere on the page, on any page.
//
// Registered on the document's capture phase, which fires top-down before
// any element's own (bubble-phase) click handler runs. Because Svelte
// mounts this action asynchronously (after the click that *opened* the
// popover has already finished dispatching), the listener is never live
// during that opening click, so there's no need for callers to
// stopPropagation just to avoid immediately closing what they just opened.
export function clickOutside(node: HTMLElement, onOutside: () => void) {
	function handleClick(event: MouseEvent) {
		// A click inside a dialog (they are moved to <body>) is never a click "elsewhere" for a popover
		// that opened it: otherwise the popover closes and takes its dialog down with it.
		const inDialog = (event.target as Element | null)?.closest?.('[data-modal-backdrop]');
		if (node && !inDialog && !node.contains(event.target as Node)) {
			onOutside();
		}
	}
	document.addEventListener('click', handleClick, true);
	return {
		update(newOnOutside: () => void) {
			onOutside = newOnOutside;
		},
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
