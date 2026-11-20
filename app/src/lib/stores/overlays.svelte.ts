// The phone's back gesture (swipe from the side, or the back button) closes the window that is
// open (a dialog, the new-task box, a task's menu) instead of leaving the page. Each open window
// adds a history entry through SvelteKit's shallow routing; going back closes the newest one.
import { pushState } from '$app/navigation';
import { page, navigating } from '$app/state';

let seq = 0;
const open = new Map<number, () => void>();

/** Call when a window opens; returns its id for closeOverlay. */
export function openOverlay(close: () => void): number {
	const id = ++seq;
	open.set(id, close);
	try {
		pushState('', { overlay: id });
	} catch {
		// router not ready (first render): the window still works, only "back" won't close it
	}
	return id;
}

/** Call when the window closes by itself (×, Escape, done): removes its history entry. */
export function closeOverlay(id: number): void {
	if (!open.delete(id)) return; // already closed by "back"
	// Next tick, and only if no page change started meanwhile (a link inside the window).
	setTimeout(() => {
		if (!navigating.to && (page.state as { overlay?: number }).overlay === id) history.back();
	}, 0);
}

/** From the layout, whenever the history entry changes: closes the windows opened after it. */
export function syncOverlays(current: number | undefined): void {
	for (const [id, close] of [...open].reverse()) {
		if (current === undefined || id > current) {
			open.delete(id);
			close();
		}
	}
}

/** Svelte action: `use:backCloses={onClose}` on a window's root element. */
export function backCloses(_node: HTMLElement, onClose: () => void) {
	let close = onClose;
	const id = openOverlay(() => close());
	return {
		update(next: () => void) {
			close = next;
		},
		destroy() {
			closeOverlay(id);
		}
	};
}
