// Error report (21 Oct 2026). Everything that goes wrong on this device (messages shown, sync
// failures, changes the server refused, crashes of the page) is written down here, sent to the
// PC (POST /client-log, kept 62 days for all devices together), and the "Error report" button
// in Help puts it together with what went wrong on the server (GET /report) into one text,
// ready to paste into a conversation with Claude.
import { getToken } from '../api/config';
import { renewTokenIfNeeded } from '../api/client';
import { deviceTag } from '../alerts/decide';

export type Kind = 'error' | 'sync' | 'refused' | 'crash' | 'alert' | 'trace';
export interface Occurrence {
	at: string;
	kind: Kind;
	message: string;
	page: string;
	count: number;
	last: string;
}

const OUTBOX = 'tasks_error_outbox'; // not sent to the PC yet
const RECENT = 'tasks_error_recent'; // this device's last 30 days (when the PC cannot be reached)
const DAY = 86_400_000;

function read(key: string): Occurrence[] {
	try {
		const v = JSON.parse(localStorage.getItem(key) ?? '[]');
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}
function write(key: string, v: Occurrence[]) {
	try {
		localStorage.setItem(key, JSON.stringify(v));
	} catch {
		// storage full or blocked: not kept
	}
}

export function device(): string {
	if (typeof location === 'undefined') return 'unknown';
	const tag = deviceTag(location.hostname, navigator.userAgent, (navigator as { platform?: string }).platform ?? '');
	const browser = /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'browser';
	return `${tag} (${browser}, ${location.host})`;
}

/** Writes one occurrence down (the same message in a row is counted, not repeated). */
export function recordError(kind: Kind, message: string): void {
	if (typeof localStorage === 'undefined' || !message) return;
	const now = new Date().toISOString();
	const page = typeof location === 'undefined' ? '' : location.pathname;
	message = message.slice(0, 1000);
	for (const key of [OUTBOX, RECENT]) {
		const list = read(key);
		const last = list[list.length - 1];
		if (last && last.message === message && last.kind === kind && Date.parse(now) - Date.parse(last.last) < DAY) {
			last.count += 1;
			last.last = now;
		} else list.push({ at: now, last: now, kind, message, page, count: 1 });
		const cutoff = Date.now() - 31 * DAY;
		write(key, list.filter((o) => Date.parse(o.last) > cutoff).slice(-300));
	}
	scheduleUpload();
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleUpload() {
	clearTimeout(timer);
	timer = setTimeout(() => void uploadErrors(), 20_000);
}

/** Sends what is waiting to the PC. Kept here if it cannot be sent. */
let lastHello = 0;
export async function uploadErrors(): Promise<void> {
	const box = read(OUTBOX);
	if (typeof fetch === 'undefined') return;
	// Nothing to send: still tell the PC, once an hour, which version this device runs, so the
	// health check can spot a device stuck on an old version (22 Oct 2026: the PC app ran the
	// 10 Oct version for days).
	if (!box.length && Date.now() - lastHello < 60 * 60 * 1000) return;
	lastHello = Date.now();
	try {
		await renewTokenIfNeeded().catch(() => undefined);
		const res = await fetch('/client-log', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
			body: JSON.stringify({ device: device(), build: __APP_BUILD__, entries: box })
		});
		if (res.ok) {
			// Only what was sent: anything recorded meanwhile stays for next time.
			const sent = new Set(box.map((o) => o.at + o.message));
			write(OUTBOX, read(OUTBOX).filter((o) => !sent.has(o.at + o.message)));
		}
	} catch {
		/* offline: next time */
	}
}

let started = false;
/** Crashes of the page are written down too; what is waiting is sent every 10 minutes. */
export function initErrorReport(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	// Harmless browser notices that are not errors of the app (25 Oct 2026: counted as "Device errors").
	const benign = /ResizeObserver loop|Script error\.?$/i;
	window.addEventListener('error', (e) => !benign.test(e.message ?? '') && recordError('crash', `${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
	window.addEventListener('unhandledrejection', (e) => {
		const r = e.reason as { message?: string } | string | undefined;
		recordError('crash', `Unhandled: ${typeof r === 'string' ? r : (r?.message ?? String(r))}`);
	});
	setTimeout(() => void uploadErrors(), 15_000);
	setInterval(() => void uploadErrors(), 10 * 60 * 1000);
}

// ---------------------------------------------------------------- the report

type Group = { message: string; count: number; first: string; last: string; extra?: string | null };
type ServerReport = {
	generated: string;
	days: number;
	health_now?: { generated: string; status: string; checks: { name: string; status: string; detail?: string; fix?: string }[] } | null;
	health_history?: Group[];
	automations?: Group[];
	vikunja?: Group[];
	offsite?: { failures?: Group[]; 'offsite-last.txt'?: string; 'offsite-sent.txt'?: string };
	alerts?: Group[];
	deploys?: string[];
	app_live?: string | null;
	devices?: Group[];
};

const d = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '');
function section(title: string, groups: Group[] | undefined, extraLabel = ''): string[] {
	const lines = [`## ${title}`];
	if (!groups || !groups.length) return [...lines, 'Nothing.', ''];
	for (const g of groups.slice(0, 40)) {
		const span = g.first === g.last ? d(g.first) : `${d(g.first)} → ${d(g.last)}`;
		lines.push(`- ×${g.count} · ${span} · ${g.message.replace(/(\\xN)+/g, '…')}${g.extra ? ` · ${extraLabel}${g.extra}` : ''}`);
	}
	return [...lines, ''];
}

/** The whole report as plain text (Markdown), for the last `days` days. */
export async function buildErrorReport(days = 30, extra: { queued?: number; refused?: string[]; statusV2?: boolean } = {}): Promise<string> {
	await uploadErrors();
	let server: ServerReport | null = null;
	let serverError = '';
	try {
		await renewTokenIfNeeded().catch(() => undefined);
		const res = await fetch(`/report?days=${days}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` }, cache: 'no-store' });
		if (res.ok) server = (await res.json()) as ServerReport;
		else serverError = res.status === 404 || res.status === 501 ? 'the PC does not offer the report yet (install the latest server tools)' : `the PC answered ${res.status}`;
	} catch {
		serverError = 'the PC could not be reached';
	}
	const out: string[] = [
		`# Tasks app: error report, last ${days} days`,
		'',
		`Made on ${new Date().toLocaleString('en-GB')} from ${device()}, app build ${__APP_BUILD__}${server?.app_live ? ` (live on the PC: ${d(server.app_live)})` : ''}.`,
		`This device: ${extra.queued ?? 0} change(s) waiting to be sent; validation status ${extra.statusV2 ? 'new (validated mark)' : 'old (not switched yet)'}.`,
		''
	];
	if (!server) {
		out.push(`**Server part missing:** ${serverError}. Below: this device only.`, '');
		const local = read(RECENT).filter((o) => Date.parse(o.last) > Date.now() - days * DAY);
		out.push(...section('Errors on this device', local.map((o) => ({ message: `[${o.kind}] ${o.message}`, count: o.count, first: o.at, last: o.last })).reverse()));
	} else {
		const hc = server.health_now;
		out.push('## Server health now');
		if (!hc) out.push('No report.');
		else {
			const bad = hc.checks.filter((c) => c.status !== 'ok');
			out.push(bad.length ? `${bad.length} problem(s) at ${d(hc.generated)}:` : `All ${hc.checks.length} checks OK at ${d(hc.generated)}.`);
			for (const c of bad) out.push(`- **${c.name}** (${c.status}): ${c.detail ?? ''}${c.fix ? ` → ${c.fix}` : ''}`);
		}
		out.push('');
		out.push(...section('Health check: hours not OK, per check', server.health_history));
		out.push(...section('Errors on the devices (all of them)', server.devices, 'device: '));
		out.push(...section('PC automations', server.automations));
		out.push(...section('Vikunja server warnings', server.vikunja, 'from: '));
		out.push(...section('Off-PC copy (to the Mac): failures', server.offsite?.failures));
		if (server.offsite) out.push(`Last run: ${server.offsite['offsite-last.txt'] ?? '—'}`, `Last file on the Mac: ${server.offsite['offsite-sent.txt'] ?? '—'}`, '');
		out.push(...section('Alerts (ntfy) on the PC', server.alerts));
		out.push('## App installs on the PC', server.deploys?.length ? server.deploys.map((x) => `- ${x.replace('_', ' ')}`).join('\n') : 'None in this period.', '');
	}
	if (extra.refused?.length) out.push('## Changes the server refused (this device)', ...extra.refused.map((r) => `- ${r}`), '');
	return out.join('\n');
}
