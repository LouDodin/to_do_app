// Alerts to your ntfy topic when this device has a problem the PC cannot see: sync stuck for
// 15 minutes, or signed out by the server. The topic is kept in your Vikunja account (so every
// device learns it at its next sync) and on the device (so it still works when signed out).
// Runs only while the app is open: a phone app in the background does not run at all.
import { setFrontendSetting } from '../api/userSettings';
import { api } from '../api/client';
import { isConfigured } from '../api/config';
import { KEYS, readNum, writeNum, readText, writeText, lastFailureAt, connectionBack } from './state';
import { decide, deviceTag, ntfyUrl, MESSAGES, type AlertKind } from './decide';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
const ACCOUNT_KEY = 'tasks_alert_topic';

export const alerts = $state({ topic: '' });

function device(): string {
	return deviceTag(location.hostname, navigator.userAgent, navigator.platform ?? '');
}

/** Sends one alert. "no-cors": a plain text POST, so the browser sends it without asking ntfy
 *  first; it resolves once the request has left the device. */
export async function send(kind: AlertKind | 'test', topic = alerts.topic): Promise<boolean> {
	if (!topic) return false;
	const m = MESSAGES[kind];
	try {
		await fetch(ntfyUrl(topic, kind, device()), { method: 'POST', mode: 'no-cors', body: m.body });
		return true;
	} catch {
		return false; // no network: tried again at the next check
	}
}

async function check() {
	if (navigator.onLine === false) return;
	const kind = decide({
		now: Date.now(),
		failingSince: readNum(KEYS.failingSince),
		lastFailureAt,
		stuckSent: readNum(KEYS.stuckSent),
		signedOutAt: readNum(KEYS.signedOutAt),
		signedOutSent: readNum(KEYS.signedOutSent)
	});
	if (!kind || !alerts.topic) return;
	if (await send(kind)) {
		if (kind === 'stuck') writeNum(KEYS.stuckSent, readNum(KEYS.failingSince));
		else writeNum(KEYS.signedOutSent, readNum(KEYS.signedOutAt));
	}
}

/** The topic saved in your account, if any, becomes this device's. */
export async function loadTopicFromAccount(): Promise<void> {
	if (!isConfigured()) return;
	try {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		const t = user.settings?.frontend_settings?.[ACCOUNT_KEY];
		if (typeof t === 'string' && t !== alerts.topic) {
			alerts.topic = t;
			writeText(KEYS.topic, t || null);
		}
	} catch {
		/* offline or signed out: keep the one on this device */
	}
}

/** Saves the topic on this device and in your account (the other devices follow). */
export async function saveTopic(topic: string): Promise<void> {
	topic = topic.trim();
	alerts.topic = topic;
	writeText(KEYS.topic, topic || null);
	await setFrontendSetting(ACCOUNT_KEY, topic);
}

let started = false;
export function initAlerts(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	alerts.topic = readText(KEYS.topic) ?? '';
	void loadTopicFromAccount();
	setInterval(() => void check(), 60 * 1000);
	setInterval(() => void loadTopicFromAccount(), 60 * 60 * 1000);
	setTimeout(() => void check(), 5000); // after the first sync attempt
	window.addEventListener('online', connectionBack);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') setTimeout(() => void check(), 5000);
	});
}
