// Server health, as written by the PC's hourly health check into the app's own
// folder (/health.json). Every device shows the same warnings: a problem seen on
// the server is visible on the phone and the Mac too, not only on the PC.
// Since 30 Oct 2026 the PC sends each person their own view: the admin (the main account) sees
// every account's warnings, with who they concern and which device caused them, and can say
// "Got it" for themselves or for everyone; the others see the server's warnings and their own.
import { getApiUrl, getToken } from '../api/config';
import { renewTokenIfNeeded } from '../api/client';

export type HealthCheck = {
	name: string;
	status: 'ok' | 'warn' | 'fail';
	detail?: string;
	fix?: string;
	acknowledged?: string;
	/** "me": acknowledged by you only; "everyone": by the admin, for every account. */
	ack_scope?: 'me' | 'everyone';
	/** The one account it concerns; none = the whole server (everyone). */
	account?: string;
	/** Which devices caused it ("LouCanava · phone (Firefox, …)"). */
	cause?: string[];
	admin_only?: boolean;
	local?: boolean;
};
export type HealthReport = {
	generated: string;
	status: 'ok' | 'warn' | 'fail';
	checks: HealthCheck[];
	vikunja?: string;
	latest_vikunja?: string;
	viewer?: { username: string | null; admin: boolean };
};

/** Who a check concerns, in words, for the admin. */
export function concerns(c: HealthCheck, me?: string | null): string {
	if (c.account) return c.account === me ? 'you' : c.account;
	return c.admin_only ? 'unknown account (older app version)' : 'everyone (the server)';
}

/** Who can see a warning (10 Nov 2026), in words, for the admin. */
export function seenBy(c: HealthCheck, me?: string | null): string {
	if (c.local) return 'only this device (it is seen from here, not by the PC)';
	if (c.ack_scope === 'everyone') return 'nobody any more (hidden for everyone)';
	if (c.account && c.account !== me) return `you (admin) and ${c.account}`;
	if (c.account || c.admin_only) return 'only you (admin)';
	return 'everyone (every account, on every device)';
}

export const health = $state({
	report: null as HealthReport | null,
	serverVersion: null as string | null,
	reachable: null as boolean | null,
	checkedAt: null as Date | null,
	dismissed: '' // generated-timestamp of the report the user closed
});

const STALE_MS = 3 * 60 * 60 * 1000; // no report for 3 h = the checker itself is not running

export function problems(): HealthCheck[] {
	const r = health.report;
	const list: HealthCheck[] = r ? r.checks.filter((c) => c.status !== 'ok') : [];
	// Seen from this device, in the same form as the PC's checks.
	if (health.reachable === false)
		list.unshift({ local: true, name: 'Connection to the PC', status: 'fail', detail: 'this device cannot reach the PC: your changes wait here and are sent when it is back', fix: 'Check that the PC is on, plugged in and connected to the internet.' });
	else if (r && Date.now() - new Date(r.generated).getTime() > STALE_MS)
		list.push({ local: true, name: 'Health check', status: 'warn', detail: `no report from the PC since ${new Date(r.generated).toLocaleString('en-GB')}`, fix: 'Run scripts\\health-check-now.bat on the PC, then scripts\\repair-services.bat if the hourly check is missing.' });
	return list;
}

export async function refreshHealth(): Promise<void> {
	try {
		const token = getToken();
		// Signed in: the PC answers with this person's own view (30 Oct 2026).
		const res = await fetch('/health.json', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
		if (res.ok) health.report = (await res.json()) as HealthReport;
	} catch {
		/* offline or file missing: keep the last one */
	}
	const base = getApiUrl();
	if (base) {
		try {
			const res = await fetch(`${base}/api/v1/info`, { cache: 'no-store' });
			health.reachable = res.ok;
			if (res.ok) health.serverVersion = ((await res.json()) as { version?: string }).version ?? null;
		} catch {
			health.reachable = false;
		}
	}
	health.checkedAt = new Date();
}

/**
 * Asks the PC to run its health check now (POST /run-health-check on the app server), then waits
 * for the new report (up to 2 minutes). Returns a short message for the user.
 */
export async function runHealthCheck(): Promise<{ ok: boolean; message: string }> {
	const before = health.report?.generated ?? '';
	try {
		await renewTokenIfNeeded().catch(() => {});
		const res = await fetch('/run-health-check', { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
		if (res.status === 401) return { ok: false, message: 'Sign in again to run a check.' };
		if (res.status === 404 || res.status === 501) return { ok: false, message: 'The PC does not offer this yet: install the latest server tools.' };
		if (res.status !== 202 && res.status !== 429) return { ok: false, message: `The PC refused (${res.status}).` };
	} catch {
		return { ok: false, message: 'The PC cannot be reached.' };
	}
	for (let i = 0; i < 24; i++) {
		await new Promise((r) => setTimeout(r, 5000));
		await refreshHealth();
		if ((health.report?.generated ?? '') !== before) {
			const n = problems().length;
			return { ok: n === 0, message: n === 0 ? 'Health check: all OK' : `Health check: ${n} problem${n > 1 ? 's' : ''}` };
		}
	}
	return { ok: false, message: 'No new report after 2 minutes: the check may still be running.' };
}

/** Warnings you acknowledged ("Got it"): not counted any more, on every device. */
export function acknowledged(): HealthCheck[] {
	return health.report?.checks.filter((c) => c.acknowledged) ?? [];
}

/**
 * "Got it" on a warning: the PC stops counting it (POST /ack-warning on the app server, see
 * tools/acks.py). scope "me": for you, on all your devices; "everyone" (admin only): for every
 * account. It comes back if the situation changes.
 */
export async function ackWarning(name: string, scope: 'me' | 'everyone' = 'me'): Promise<{ ok: boolean; message: string }> {
	try {
		await renewTokenIfNeeded().catch(() => {});
		const res = await fetch('/ack-warning', { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, scope }) });
		if (res.status === 401) return { ok: false, message: 'Sign in again first.' };
		if (res.status === 404 || res.status === 501) return { ok: false, message: 'The PC does not offer this yet: install the latest server tools.' };
		if (res.status === 409) return { ok: false, message: 'This warning has already gone.' };
		if (res.status === 403) return { ok: false, message: 'Only the admin can hide a warning for everyone.' };
		if (!res.ok) return { ok: false, message: `The PC refused (${res.status}).` };
	} catch {
		return { ok: false, message: 'The PC cannot be reached.' };
	}
	await refreshHealth();
	return { ok: true, message: scope === 'everyone' ? `${name}: hidden for everyone` : `${name}: hidden for you, on all your devices` };
}

let timer: ReturnType<typeof setInterval> | undefined;
export function initHealth() {
	if (typeof window === 'undefined' || timer) return;
	void refreshHealth();
	timer = setInterval(() => void refreshHealth(), 10 * 60 * 1000);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshHealth());
}
