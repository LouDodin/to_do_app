// Keeps the record of what was planned each day (utils/dayPlan.ts), on the device and in your
// Vikunja account, so every device shows the same summary.
import { updateFrontendSettings } from '../api/userSettings';
import { api } from '../api/client';
import { isConfigured } from '../api/config';
import { db } from '../db/schema';
import { notePlanned, mergePlans, dayKey, nextDayKey, type Plans } from '../utils/dayPlan';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
const KEY = 'tasks_day_plans';

export const dayPlans = $state({ plans: {} as Plans });

function readLocal(): Plans {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}
function writeLocal(p: Plans) {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		/* kept in memory */
	}
}

let running = false;
/** Notes today's "today" tasks; merges with the account and saves there when something is new. */
export async function refreshDayPlan(): Promise<void> {
	if (running) return;
	running = true;
	try {
		let plans = mergePlans(readLocal(), dayPlans.plans);
		let remote: Plans = {};
		let user: { settings?: UserSettings } | null = null;
		if (isConfigured()) {
			try {
				user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
				const r = user.settings?.frontend_settings?.[KEY];
				if (r && typeof r === 'object') remote = r as Plans;
			} catch {
				user = null;
			}
		}
		plans = mergePlans(plans, remote);
		const noted = notePlanned(plans, await db.tasks.toArray());
		if (noted) plans = noted;
		dayPlans.plans = plans;
		writeLocal(plans);
		if (user?.settings && JSON.stringify(plans) !== JSON.stringify(remote)) {
			const mine = plans;
			// Merged again with what is in the account right now (another device may have just saved).
			await updateFrontendSettings((fs) => {
				const now = fs[KEY] && typeof fs[KEY] === 'object' ? (fs[KEY] as Plans) : {};
				const merged = mergePlans(mine, now);
				return JSON.stringify(merged) === JSON.stringify(now) ? undefined : { ...fs, [KEY]: merged };
			}).catch(() => undefined);
		}
	} finally {
		running = false;
	}
}

/** A task chosen for tomorrow (Tomorrow's priorities, Weekly review): written under tomorrow, so it
 *  does not count as planned for today, unless it already was (13 Nov 2026). */
export async function noteChosenForTomorrow(id: number): Promise<void> {
	const now = new Date();
	const plans = mergePlans(readLocal(), dayPlans.plans);
	if ((plans[dayKey(now)] ?? []).includes(id)) return;
	const k = nextDayKey(now);
	plans[k] = [...new Set([...(plans[k] ?? []), id])];
	dayPlans.plans = plans;
	writeLocal(plans);
	await refreshDayPlan();
}

let started = false;
export function initDayPlan(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	dayPlans.plans = readLocal();
	setTimeout(() => void refreshDayPlan(), 20_000);
	setInterval(() => void refreshDayPlan(), 15 * 60 * 1000);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshDayPlan());
}
