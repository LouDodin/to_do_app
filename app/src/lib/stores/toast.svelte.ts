// A minimal toast/snackbar store — the app used to do all its work
// silently, which made actions (task created, label deleted, a sync
// failure) invisible unless you happened to be looking at the right
// place. Any part of the app can call toast.show(...) to surface brief,
// self-dismissing feedback, rendered by <ToastHost /> in the root layout.

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: number;
	message: string;
	kind: 'info' | 'success' | 'error';
	action?: ToastAction;
}

import { recordError } from './errorReport';

let idCounter = 0;
let toasts = $state<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

// Error history (Settings > Errors): every error is kept on this device, the same message
// counted rather than repeated, so it can be copied in one go for Claude.
export interface ErrorEntry {
	first: string; // ISO time of the first occurrence
	last: string; // ISO time of the latest one
	count: number;
	message: string;
	page: string;
}
const LOG_KEY = 'tasks_error_log';
const LOG_MAX = 100;
// Same error shown again within this delay: counted in the history, not shown a second time.
const QUIET_MS = 10 * 60 * 1000;

function readLog(): ErrorEntry[] {
	try {
		const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((e) => e && typeof e.message === 'string') : [];
	} catch {
		return [];
	}
}
let errorLog = $state<ErrorEntry[]>(typeof localStorage === 'undefined' ? [] : readLog());
function saveLog() {
	try {
		localStorage.setItem(LOG_KEY, JSON.stringify(errorLog));
	} catch {
		// not kept
	}
}
/** Records an error; returns true when it should be shown (not seen in the last minutes). */
function logError(message: string): boolean {
	recordError('error', message);
	const now = new Date();
	const page = typeof location === 'undefined' ? '' : location.pathname;
	const latest = errorLog.find((e) => e.message === message);
	const recent = latest && now.getTime() - new Date(latest.last).getTime() < QUIET_MS;
	if (latest && errorLog[0] === latest) {
		errorLog = [{ ...latest, last: now.toISOString(), count: latest.count + 1, page }, ...errorLog.slice(1)];
	} else {
		errorLog = [{ first: now.toISOString(), last: now.toISOString(), count: 1, message, page }, ...errorLog].slice(0, LOG_MAX);
	}
	saveLog();
	return !recent;
}

function show(
	message: string,
	kind: Toast['kind'] = 'info',
	options: { durationMs?: number; action?: ToastAction } = {}
) {
	const durationMs = options.durationMs ?? (options.action ? 6000 : 3200);
	// The same message already on screen: keep that one a little longer instead of stacking.
	const same = toasts.find((t) => t.message === message && t.kind === kind);
	if (same) {
		clearTimeout(timers.get(same.id));
		timers.set(same.id, setTimeout(() => dismiss(same.id), durationMs));
		return;
	}
	const id = idCounter++;
	toasts = [...toasts, { id, message, kind, action: options.action }];
	timers.set(id, setTimeout(() => dismiss(id), durationMs));
}

function dismiss(id: number) {
	clearTimeout(timers.get(id));
	timers.delete(id);
	toasts = toasts.filter((t) => t.id !== id);
}

function error(message: string) {
	const visible = toasts.some((t) => t.message === message && t.kind === 'error');
	if (logError(message) || visible) show(message, 'error', { durationMs: 5000 });
}

/** Plain text of the error history, ready to paste into a conversation with Claude. */
export function errorReport(): string {
	const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
	const lines = errorLog.map((e) => {
		const when = e.count > 1 ? `${e.first} → ${e.last} (×${e.count})` : e.first;
		return `- ${when} on ${e.page || '/'}: ${e.message}`;
	});
	return [`Tasks app error history (${errorLog.length} entr${errorLog.length === 1 ? 'y' : 'ies'})`, `Device: ${ua}`, '', ...lines].join('\n');
}

export const toastStore = {
	get toasts() {
		return toasts;
	},
	show,
	success: (message: string, action?: ToastAction) => show(message, 'success', { action }),
	error,
	dismiss,
	get errors() {
		return errorLog;
	},
	clearErrors() {
		errorLog = [];
		saveLog();
	}
};
