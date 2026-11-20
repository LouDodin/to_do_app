// Opens a menu (positioned under its container) upwards when there is not enough room below and
// more above (5 Nov 2026, task "Quand pas assez de place vers le bas, ouvrir les menus vers le
// haut"). When it fits on neither side, it takes the larger side and scrolls inside, so it never
// runs off the window.
export function placeVertically(node: HTMLElement, gap = 0) {
	function place() {
		const parent = node.offsetParent as HTMLElement | null;
		if (!parent) return;
		const rect = parent.getBoundingClientRect();
		const h = node.scrollHeight + 8;
		const below = window.innerHeight - rect.bottom;
		const above = rect.top;
		const flip = below < h && (above >= h || above > below);
		node.style.top = flip ? 'auto' : '';
		node.style.bottom = flip ? `calc(100% + ${gap}px)` : '';
		const room = (flip ? above : below) - 12;
		if (h > room + 12) {
			node.style.maxHeight = `${Math.max(120, room)}px`;
			node.style.overflowY = 'auto';
		} else {
			node.style.maxHeight = '';
			node.style.overflowY = '';
		}
	}
	place();
	const ro = new ResizeObserver(place);
	ro.observe(node);
	window.addEventListener('resize', place);
	window.addEventListener('scroll', place, true);
	return {
		destroy() {
			ro.disconnect();
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		}
	};
}
