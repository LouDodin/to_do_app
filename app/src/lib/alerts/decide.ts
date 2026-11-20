// Which alert (if any) this device should send now. Pure, so it is unit-tested.

export const STUCK_AFTER_MS = 15 * 60 * 1000;
// A failure older than this is from before the app went to sleep: wait for a fresh attempt.
export const FRESH_FAILURE_MS = 6 * 60 * 1000;

export type AlertInput = {
	now: number;
	failingSince: number | null;
	lastFailureAt: number | null;
	stuckSent: number | null;
	signedOutAt: number | null;
	signedOutSent: number | null;
};
export type AlertKind = 'stuck' | 'signedOut';

export function decide(i: AlertInput): AlertKind | null {
	if (i.signedOutAt !== null && i.signedOutSent !== i.signedOutAt) return 'signedOut';
	if (
		i.failingSince !== null &&
		i.stuckSent !== i.failingSince &&
		i.now - i.failingSince >= STUCK_AFTER_MS &&
		i.lastFailureAt !== null &&
		i.now - i.lastFailureAt <= FRESH_FAILURE_MS
	)
		return 'stuck';
	return null;
}

// Generic on purpose: the topic is a public channel, so no task, project or server detail.
// Same wording as the PC's alerts (tools/healthcheck.py): "Tasks problem: …", "Tasks warning: …".
export const MESSAGES: Record<AlertKind | 'test', { title: string; body: string; tags: string }> = {
	stuck: { title: 'Tasks problem: sync stuck', body: 'One of your devices has not synced for 15 minutes. What to do: open Tasks there, Help (?) > Status.', tags: 'warning' },
	signedOut: { title: 'Tasks problem: signed out', body: 'One of your devices was signed out of Tasks. What to do: open Tasks there and sign in again.', tags: 'warning' },
	test: { title: 'Tasks: test alert', body: 'Alerts from this device work.', tags: 'white_check_mark,test' }
};

/** Short device kind for the alert's tags. "pc" (the server PC itself) is not shown on that PC. */
export function deviceTag(host: string, ua: string, platform: string): string {
	if (host === '127.0.0.1' || host === 'localhost') return 'pc';
	if (/iPhone|iPad|Android|Mobile/i.test(ua)) return 'phone';
	if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'mac';
	if (/Win/i.test(platform)) return 'windows';
	return 'computer';
}

export function ntfyUrl(topic: string, kind: AlertKind | 'test', device: string): string {
	const m = MESSAGES[kind];
	const server = topic.includes('://') ? topic.replace(/\/+$/, '') : `https://ntfy.sh/${encodeURIComponent(topic)}`;
	const q = new URLSearchParams({ title: m.title, tags: `${m.tags},${device}`, priority: kind === 'test' ? '3' : '4' });
	return `${server}?${q}`;
}
