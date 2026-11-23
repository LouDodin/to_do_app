// Pages and features each account chooses to see (23 Nov 2026, Lou: "select which pages each user
// wants to see; by default, everything"). Kept on the device and in the account's settings
// (frontend_settings.tasks_hidden_features), so the choice follows the account to every device.
// Only what is switched OFF is stored: anything new appears by default.
import { setFrontendSetting } from '../api/userSettings';
import { api } from '../api/client';
import { isConfigured } from '../api/config';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
const KEY = 'tasks_hidden_features';

export type Feature =
	| 'page:shopping'
	| 'page:upcoming'
	| 'page:tomorrow'
	| 'page:weekly'
	| 'page:bin'
	| 'home:ongoing'
	| 'home:today'
	| 'home:week'
	| 'home:red'
	| 'home:available'
	| 'area-switch'
	| 'reminders'
	| 'ongoing';

export const FEATURE_GROUPS: { title: string; items: { key: Feature; label: string; hint?: string }[] }[] = [
	{
		title: 'Pages in the menu',
		items: [
			{ key: 'page:shopping', label: 'Shopping', hint: 'with the cart buttons' },
			{ key: 'page:upcoming', label: 'Upcoming' },
			{ key: 'page:tomorrow', label: 'Tomorrow' },
			{ key: 'page:weekly', label: 'Weekly review' },
			{ key: 'page:bin', label: 'Bin' }
		]
	},
	{
		title: 'Home page',
		items: [
			{ key: 'home:ongoing', label: 'Ongoing' },
			{ key: 'home:today', label: 'Today' },
			{ key: 'home:week', label: 'This week' },
			{ key: 'home:red', label: 'Red' },
			{ key: 'home:available', label: 'Available' }
		]
	},
	{
		title: 'Features',
		items: [
			{ key: 'area-switch', label: 'All / Pro / Perso', hint: 'in the top bar' },
			{ key: 'ongoing', label: 'Ongoing tasks' },
			{ key: 'reminders', label: 'Reminders' }
		]
	}
];

/** The page each switchable menu page lives at. */
export const PAGE_PATHS: Partial<Record<Feature, string>> = {
	'page:shopping': '/shopping',
	'page:upcoming': '/upcoming',
	'page:tomorrow': '/today-review',
	'page:weekly': '/weekly',
	'page:bin': '/bin'
};

function clean(v: unknown): Feature[] {
	const known = new Set(FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
	return Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && known.has(x as Feature)) as Feature[]) : [];
}
function readLocal(): Feature[] {
	try {
		return clean(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
	} catch {
		return [];
	}
}
function writeLocal(hidden: Feature[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(hidden));
	} catch {
		/* storage unavailable: kept for this visit */
	}
}

export const features = $state({ hidden: readLocal() });

/** True unless the account switched it off. */
export function shown(f: Feature): boolean {
	return !features.hidden.includes(f);
}

/** The device's choice at once, then the account's. */
export async function loadFeatures(): Promise<void> {
	if (!isConfigured()) return;
	try {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		const remote = user.settings?.frontend_settings?.[KEY];
		if (remote !== undefined) {
			features.hidden = clean(remote);
			writeLocal(features.hidden);
		}
	} catch {
		/* offline or signed out: the device's choice */
	}
}

export async function setShown(f: Feature, on: boolean): Promise<void> {
	features.hidden = on ? features.hidden.filter((x) => x !== f) : [...new Set([...features.hidden, f])];
	writeLocal(features.hidden);
	try {
		await setFrontendSetting(KEY, features.hidden);
	} catch {
		/* offline: kept on this device, sent with the next change */
	}
}
