// Connection settings: the user's Vikunja instance URL and their JWT.
// Stored in localStorage (not IndexedDB) because it must be readable
// synchronously before the DB/sync layers can even initialize.

const URL_KEY = 'vikunja_api_url';
const TOKEN_KEY = 'vikunja_jwt';

export function getApiUrl(): string | null {
	if (typeof localStorage === 'undefined') return null;
	const stored = localStorage.getItem(URL_KEY);
	if (stored) return stored;
	// Signed in but the address was lost (22 Oct 2026, the Mac: "Vikunja API URL is not
	// configured", nothing synced): use the usual address next to the app instead of stopping.
	if (!localStorage.getItem(TOKEN_KEY)) return null;
	// …and kept from now on (19 Nov 2026), so it is still known after a sign-out.
	const guess = defaultApiUrl();
	if (guess) setApiUrl(guess);
	return guess || null;
}

export function setApiUrl(url: string) {
	// Normalize: strip trailing slash so callers can safely do `${base}/path`.
	localStorage.setItem(URL_KEY, url.replace(/\/+$/, ''));
}

export function getToken(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth() {
	localStorage.removeItem(TOKEN_KEY);
}

export function isConfigured(): boolean {
	return !!getApiUrl() && !!getToken();
}

// Suggested server address on the sign-in screen. The usual set-up serves the app on
// https://<server>:8443 and Vikunja on https://<server>, so that is the guess; anyone
// can type another address.
export function defaultApiUrl(): string {
	if (typeof location === 'undefined') return '';
	if (location.port === '8443') return `${location.protocol}//${location.hostname}`;
	// The app served straight from the server PC (Windows quick capture): Vikunja is next to it.
	if ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '5173')
		return 'http://127.0.0.1:3456';
	return '';
}
