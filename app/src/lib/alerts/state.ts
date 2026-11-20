// What the alerts need to remember across reloads (a phone app is restarted often), kept in
// localStorage. No imports: the sync store, the API client and sign-in all write here.
// Decisions live in decide.ts, sending in alerts.svelte.ts.

export const KEYS = {
	topic: 'tasks_alert_topic',
	failingSince: 'tasks_sync_failing_since', // first failed sync since the last good one
	stuckSent: 'tasks_alert_stuck_sent', // = failingSince of the episode already reported
	signedOutAt: 'tasks_signed_out_at', // set only when the server ended the session
	signedOutSent: 'tasks_alert_signedout_sent' // = signedOutAt of the episode already reported
} as const;

function get(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function set(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* storage unavailable: alerts simply restart their count */
	}
}
export const readNum = (key: string): number | null => {
	const v = Number(get(key));
	return Number.isFinite(v) && v > 0 ? v : null;
};
export const writeNum = (key: string, v: number | null) => set(key, v === null ? null : String(v));
export const readText = get;
export const writeText = set;

// Last failed attempt, in memory only: after the app has been asleep, an old failure must not
// count until a fresh attempt fails too.
export let lastFailureAt: number | null = null;

export function syncFailed(now = Date.now()) {
	// No network on this device (plane, metro): not a sync problem, and ntfy is out of reach too.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
	lastFailureAt = now;
	if (readNum(KEYS.failingSince) === null) writeNum(KEYS.failingSince, now);
}
/** The network just came back: only a failure after this counts (the sync retries at once). */
export function connectionBack() {
	lastFailureAt = null;
}
export function syncSucceeded() {
	lastFailureAt = null;
	writeNum(KEYS.failingSince, null);
	writeNum(KEYS.stuckSent, null);
}
/** The server ended the session (not "Sign out" pressed by you). */
export function sessionLost(now = Date.now()) {
	if (readNum(KEYS.signedOutAt) === null) writeNum(KEYS.signedOutAt, now);
}
/** Signed in again, or signed out on purpose: nothing to report. */
export function sessionSettled() {
	writeNum(KEYS.signedOutAt, null);
	writeNum(KEYS.signedOutSent, null);
}
