import { describe, it, expect } from 'vitest';
import { decide, deviceTag, ntfyUrl, STUCK_AFTER_MS, MESSAGES } from './decide';

const base = { now: 10_000_000, failingSince: null, lastFailureAt: null, stuckSent: null, signedOutAt: null, signedOutSent: null };

describe('alerts', () => {
	it('nothing when sync works', () => {
		expect(decide(base)).toBeNull();
	});
	it('not before 15 minutes of failures', () => {
		expect(decide({ ...base, failingSince: base.now - STUCK_AFTER_MS + 1000, lastFailureAt: base.now })).toBeNull();
	});
	it('stuck after 15 minutes, once per episode', () => {
		const s = { ...base, failingSince: base.now - STUCK_AFTER_MS, lastFailureAt: base.now - 1000 };
		expect(decide(s)).toBe('stuck');
		expect(decide({ ...s, stuckSent: s.failingSince })).toBeNull();
		expect(decide({ ...s, failingSince: s.failingSince + 1, stuckSent: s.failingSince })).toBeNull(); // new episode, not 15 min yet
	});
	it('an old failure from before the app slept does not count', () => {
		expect(decide({ ...base, failingSince: base.now - 3 * STUCK_AFTER_MS, lastFailureAt: null })).toBeNull();
		expect(decide({ ...base, failingSince: base.now - 3 * STUCK_AFTER_MS, lastFailureAt: base.now - 20 * 60_000 })).toBeNull();
	});
	it('signed out, once per episode, before stuck', () => {
		const s = { ...base, signedOutAt: base.now - 5, failingSince: base.now - STUCK_AFTER_MS, lastFailureAt: base.now };
		expect(decide(s)).toBe('signedOut');
		expect(decide({ ...s, signedOutSent: s.signedOutAt })).toBe('stuck');
	});
	it('device tags', () => {
		expect(deviceTag('127.0.0.1', 'Mozilla Windows', 'Win32')).toBe('pc');
		expect(deviceTag('pc-lou.x.ts.net', 'Mozilla (Linux; Android 14; OnePlus) Mobile', 'Linux armv8l')).toBe('phone');
		expect(deviceTag('pc-lou.x.ts.net', 'Mozilla (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel')).toBe('mac');
		expect(deviceTag('pc-lou.x.ts.net', 'Mozilla (Windows NT 10.0)', 'Win32')).toBe('windows');
	});
	it('the message is generic and goes in the body; title and tags in the address', () => {
		const u = new URL(ntfyUrl('tasks-x', 'stuck', 'phone'));
		expect(u.origin + u.pathname).toBe('https://ntfy.sh/tasks-x');
		expect(u.searchParams.get('tags')).toBe('warning,phone');
		expect(u.searchParams.get('priority')).toBe('4');
		for (const m of Object.values(MESSAGES)) expect(m.body + m.title).not.toMatch(/pc-lou|ts\.net|http/i);
	});
	it('accepts a full server address too', () => {
		expect(ntfyUrl('https://ntfy.example.org/t1/', 'test', 'mac').startsWith('https://ntfy.example.org/t1?')).toBe(true);
	});
});

describe('alerts and the network', () => {
	it('a device without network does not start a "stuck" count', async () => {
		const { syncFailed, KEYS, readNum, connectionBack, syncSucceeded } = await import('./state');
		const store = new Map<string, string>();
		(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
		Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
		syncFailed(1000);
		expect(readNum(KEYS.failingSince)).toBeNull();
		Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
		syncFailed(2000);
		expect(readNum(KEYS.failingSince)).toBe(2000);
		connectionBack();
		expect((await import('./state')).lastFailureAt).toBeNull();
		syncSucceeded();
		expect(readNum(KEYS.failingSince)).toBeNull();
	});
});
