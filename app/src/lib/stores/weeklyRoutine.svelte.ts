// The ticks of the Weekly review's fixed jobs (Desktop, Downloads). Kept on the device and in
// your Vikunja account, so a job ticked on the Mac is ticked on the PC too. Offline, the device
// keeps its ticks and sends them with the next tick made online.
import { setFrontendSetting } from '../api/userSettings';
import { api } from '../api/client';
import { isConfigured } from '../api/config';
import { doneThisWeek, toggled, type RoutineState } from '../utils/weeklyRoutine';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
const KEY = 'tasks_weekly_routine';

function readLocal(): unknown {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? 'null');
	} catch {
		return null;
	}
}
function writeLocal(s: RoutineState) {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		/* storage unavailable: kept in memory for this visit */
	}
}

export const routine = $state({ done: [] as string[] });

/** Reads the ticks of this week: the device's at once, then the account's. */
export async function loadRoutine(): Promise<void> {
	routine.done = doneThisWeek(readLocal());
	if (!isConfigured()) return;
	try {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		const remote = user.settings?.frontend_settings?.[KEY];
		if (remote && typeof remote === 'object') {
			const done = doneThisWeek(remote);
			const local = doneThisWeek(readLocal());
			// Same week on both sides: the account wins unless this device has more (offline ticks).
			routine.done = local.length > done.length ? local : done;
			writeLocal({ ...(remote as RoutineState), done: routine.done });
		}
	} catch {
		/* offline or signed out: the device's ticks */
	}
}

export async function toggleRoutine(id: string): Promise<void> {
	const next = toggled(routine.done, id);
	routine.done = next.done;
	writeLocal(next);
	try {
		await setFrontendSetting(KEY, next);
	} catch {
		/* offline: kept on this device */
	}
}
