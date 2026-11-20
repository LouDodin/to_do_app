// Svelte action: calls `callback` on the first click/tap that lands outside
// `node`. Used to close every popover/menu in the app (label pickers,
// project pickers, filter/label popovers, ...) as soon as the user clicks
// anywhere else on the page — on any page, for any menu, per spec.
//
// Listens in the capture phase so it sees the click before the target's own
// handlers, but that's still safe for the *opening* click: Svelte mounts
// this action (and therefore calls addEventListener) in a microtask that
// only runs once the click event's own synchronous dispatch has fully
// finished, so the listener can never fire on the very click that opened
// the popover.
export function clickOutside(node: HTMLElement, callback: () => void) {
	function handleClick(event: MouseEvent) {
		if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
			callback();
		}
	}

	document.addEventListener('click', handleClick, true);

	return {
		update(newCallback: () => void) {
			callback = newCallback;
		},
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
