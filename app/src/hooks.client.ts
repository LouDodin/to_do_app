// A page left open across an update can ask for a piece of the OLD version that the server no
// longer has: SvelteKit then shows "500 Internal Error" (22 Oct 2026, on the Mac). Reloading
// fetches the new version and fixes it; unsent changes are kept (they live in this device's
// database, not in the page). Once per session, so a real error is never hidden by a reload loop.
import type { HandleClientError } from '@sveltejs/kit';

const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|Unable to preload/i;

export function reloadForNewVersion(): boolean {
	try {
		if (sessionStorage.getItem('reloaded_for_stale_chunk')) return false;
		sessionStorage.setItem('reloaded_for_stale_chunk', String(Date.now()));
	} catch {
		return false;
	}
	// Go where you were going (the page that could not open), else reload this one.
	const target = (window as unknown as { __navTarget?: string }).__navTarget;
	if (target && target !== location.href) location.href = target;
	else location.reload();
	return true;
}

if (typeof window !== 'undefined') {
	window.addEventListener('vite:preloadError', (e) => {
		if (reloadForNewVersion()) e.preventDefault();
	});
}

export const handleError: HandleClientError = ({ error }) => {
	const message = error instanceof Error ? error.message : String(error);
	if (STALE.test(message)) reloadForNewVersion();
	return { message: 'Internal Error' };
};
