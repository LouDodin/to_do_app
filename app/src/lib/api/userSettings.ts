// The app keeps a few things in your Vikunja account's settings (frontend_settings): sections,
// day plans, the weekly routine, the alert topic, the status migration flag. Vikunja replaces the
// whole settings object on every save, so two saves that each read it first and write it back
// later lose each other's change (13 Nov 2026: the sections were wiped by a day-plan save made at
// the same moment). Every save goes through here: one at a time, each reading a fresh copy just
// before writing it back, and changing only its own key.
import { api } from './client';

type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;

let chain: Promise<unknown> = Promise.resolve();

/**
 * Applies `change` to a fresh copy of frontend_settings and saves it. `change` gets the current
 * value and returns the new one (or undefined to save nothing). Rejects when offline or refused.
 */
export function updateFrontendSettings(change: (fs: Record<string, unknown>) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>): Promise<void> {
	const run = chain.then(async () => {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		const settings = user.settings ?? {};
		const next = await change({ ...(settings.frontend_settings ?? {}) });
		if (!next) return;
		await api.post('/api/v1/user/settings/general', { ...settings, frontend_settings: next });
	});
	chain = run.catch(() => undefined);
	return run;
}

/** Sets one key of frontend_settings. */
export function setFrontendSetting(key: string, value: unknown): Promise<void> {
	return updateFrontendSettings((fs) => ({ ...fs, [key]: value }));
}
