// Two windows of the app on one device share the refresh cookie (4 Nov 2026): only one of them
// may refresh at a time, and the one that waited must use the new token, not refresh again.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const jwt = (expInSec: number) => `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSec }))}.y`;

describe('token refresh across windows', () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k)
		});
		// A browser-wide lock, shared by both "windows".
		let chain: Promise<unknown> = Promise.resolve();
		vi.stubGlobal('navigator', {
			onLine: true,
			locks: { request: (_n: string, cb: () => Promise<boolean>) => { const r = chain.then(cb); chain = r.catch(() => undefined); return r; } }
		});
	});

	it('refreshes once for two windows, both end up with the new token', async () => {
		localStorage.setItem('vikunja_api_url', 'https://server');
		localStorage.setItem('vikunja_jwt', jwt(60)); // expires in a minute
		let calls = 0;
		const fresh = jwt(600);
		vi.stubGlobal('fetch', vi.fn(async () => {
			calls++;
			await new Promise((r) => setTimeout(r, 20));
			return new Response(JSON.stringify({ token: fresh }), { status: 200 });
		}));
		vi.resetModules();
		const win1 = await import('./client');
		vi.resetModules();
		const win2 = await import('./client');
		await Promise.all([win1.renewTokenIfNeeded(), win2.renewTokenIfNeeded()]);
		expect(calls).toBe(1);
		expect(localStorage.getItem('vikunja_jwt')).toBe(fresh);
	});

	it('without the lock (older browsers) it still works in one window', async () => {
		vi.stubGlobal('navigator', { onLine: true });
		localStorage.setItem('vikunja_api_url', 'https://server');
		localStorage.setItem('vikunja_jwt', jwt(60));
		const fresh = jwt(600);
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ token: fresh }), { status: 200 })));
		vi.resetModules();
		const win = await import('./client');
		await win.renewTokenIfNeeded();
		expect(localStorage.getItem('vikunja_jwt')).toBe(fresh);
	});

	it('a renewal that fails at the same moment as another (19 Nov 2026) is tried again, not a sign-out', async () => {
		vi.stubGlobal('navigator', { onLine: true });
		localStorage.setItem('vikunja_api_url', 'https://server');
		localStorage.setItem('vikunja_jwt', jwt(60));
		const fresh = jwt(600);
		let calls = 0;
		vi.stubGlobal('fetch', vi.fn(async () => (++calls === 1 ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ token: fresh }), { status: 200 }))));
		vi.resetModules();
		const win = await import('./client');
		await win.renewTokenIfNeeded();
		expect(calls).toBe(2);
		expect(localStorage.getItem('vikunja_jwt')).toBe(fresh);
	});
});
