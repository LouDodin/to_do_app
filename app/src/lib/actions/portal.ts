// Moves an element to <body> so it is positioned against the whole window, never against
// (or clipped by) the component it was written in, and clicks inside it cannot bubble up
// into that component.
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
