import { getApiUrl, getToken, setToken, clearAuth } from './config';
import { sessionLost } from '../alerts/state';
import { goto } from '$app/navigation';

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

// Thrown instead of ApiError when the browser reports no network connection,
// so callers (the sync engine) can distinguish "server rejected this" from
// "we're offline, queue it" without inspecting error text.
export class OfflineError extends Error {
	constructor() {
		super('offline');
	}
}

// Vikunja's JWT only lives about 10 minutes. A long-lived refresh token sits in an HttpOnly
// cookie; POST /user/token/refresh (cookie only, no Authorization header) returns a new JWT.
// Each refresh rotates the cookie, so only one refresh may run at a time: in this window
// (`renewing`) AND across the app's windows and tabs on the device, which share the cookie
// (4 Nov 2026: the installed app and the Ctrl+Alt+T window on the PC refreshed in the same
// second every 8 minutes; one got "database is locked" (500) or "Invalid refresh token" and the
// device then synced with "Unauthorized"). A browser-wide lock serialises them, and a window that
// waited uses the token another window just got instead of refreshing again.
let renewing: Promise<boolean> | null = null;
function renewToken(): Promise<boolean> {
	const before = getToken();
	renewing ??= withRefreshLock(async () => {
		const now = getToken();
		if (now && now !== before && expiresInMs(now) > 3 * 60 * 1000) return true; // another window did it
		const base = getApiUrl();
		if (!base) return false;
		try {
			const ask = () =>
				fetch(`${base}/api/v1/user/token/refresh`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' }
				});
			let res = await ask();
			// 19 Nov 2026 (Lou: "stay connected always"): the server's refresh cookie is single-use and
			// replaced at each renewal; two renewals at the same moment (two windows, a device waking
			// up) made one of them fail (500, or 401 with the cookie just replaced) and signed the
			// device out. Try again once, a moment later, with the new cookie.
			if (!res.ok && res.status !== 400) {
				await new Promise((r) => setTimeout(r, 900));
				const other = getToken();
				if (other && other !== now && expiresInMs(other) > 15_000) return true;
				res = await ask();
			}
			if (!res.ok) {
				// Another window may have rotated the cookie at that very moment: its token is valid.
				const other = getToken();
				return !!other && other !== now && expiresInMs(other) > 15_000;
			}
			const data = (await res.json()) as { token?: string };
			if (!data.token) return false;
			setToken(data.token);
			return true;
		} catch {
			return false;
		}
	}).finally(() => {
		renewing = null;
	});
	return renewing;
}

function withRefreshLock(fn: () => Promise<boolean>): Promise<boolean> {
	const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<boolean>) => Promise<boolean> } }).locks : undefined;
	return locks?.request ? locks.request('tasks-token-refresh', fn) : fn();
}

function expiresInMs(token: string): number {
	try {
		const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp as number;
		return exp * 1000 - Date.now();
	} catch {
		return 0;
	}
}

function tokenExpired(token: string | null): boolean {
	if (!token) return false;
	try {
		const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp as number;
		return exp * 1000 - Date.now() < 15_000;
	} catch {
		return false;
	}
}

// Renew ahead of expiry (called at start-up and every minute).
export async function renewTokenIfNeeded(): Promise<void> {
	const token = getToken();
	if (!token) return;
	try {
		const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp as number;
		if (exp * 1000 - Date.now() < 3 * 60 * 1000) await renewToken();
	} catch {
		/* unreadable token: the 401 path will handle it */
	}
}

async function request<T>(path: string, opts: RequestInit = {}, retried = false, onHeaders?: (h: Headers) => void): Promise<T> {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		throw new OfflineError();
	}
	const base = getApiUrl();
	if (!base) throw new Error('Vikunja API URL is not configured');
	// A device waking up (laptop lid, phone unlocked) holds an expired sign-in: renew it first
	// rather than sending a request the server refuses (they showed up as 401s in the server log).
	if (!retried && tokenExpired(getToken())) await renewToken();
	const token = getToken();

	let res: Response;
	try {
		res = await fetch(`${base}${path}`, {
			...opts,
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(opts.headers ?? {})
			}
		});
	} catch (err) {
		// fetch() throws on network failure (DNS, refused connection, etc.) —
		// treat that the same as the navigator.onLine check above.
		throw new OfflineError();
	}

	if (res.status === 401) {
		if (!retried && (await renewToken())) return request<T>(path, opts, true, onHeaders);
		if (getToken()) sessionLost(); // the server ended a session this device had
		clearAuth();
		if (typeof window !== 'undefined') {
			goto('/login');
		}
		throw new ApiError(401, 'Unauthorized');
	}

	if (!res.ok) {
		let message = res.statusText;
		try {
			const body = await res.json();
			message = body.message ?? message;
		} catch {
			/* ignore non-JSON error bodies */
		}
		throw new ApiError(res.status, message);
	}

	onHeaders?.(res.headers);
	if (res.status === 204) return undefined as T;
	try {
		return (await res.json()) as T;
	} catch (err) {
		// The network dropped while the answer was arriving (a laptop going to sleep): the body
		// read fails with "Failed to fetch". Offline, not a fault (6 Nov 2026: shown as "Device
		// errors" on the Mac).
		if (err instanceof TypeError) throw new OfflineError();
		throw err;
	}
}

// Every page of a list. Vikunja returns at most 50 items per request and says how many
// pages there are in X-Pagination-Total-Pages (labels beyond the first 50 used to be
// silently missing). Items are de-duplicated by id: saved-filter pseudo-projects are
// repeated on every page of /projects.
async function getAll<T extends { id: number }>(path: string, maxPages = 200): Promise<T[]> {
	const sep = path.includes('?') ? '&' : '?';
	const byId = new Map<number, T>();
	for (let page = 1; page <= maxPages; page++) {
		let total = 0;
		const batch = await request<T[]>(`${path}${sep}page=${page}&per_page=50`, {}, false, (h) => {
			total = Number(h.get('x-pagination-total-pages') ?? 0);
		});
		if (!Array.isArray(batch) || batch.length === 0) break;
		for (const item of batch) byId.set(item.id, item);
		if (total > 0 ? page >= total : batch.length < 50) break;
	}
	return [...byId.values()];
}

export const api = {
	getAll,
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
	put: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
