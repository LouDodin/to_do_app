// The GTD automations for the signed-in account (26 Oct 2026). They run on the PC. They are on by
// default: the app switches them on by itself for a new account, unless the person switched them
// off (Help > Automations), which the PC remembers. Switching on creates a Vikunja API token for this account
// only (with just the rights the automations need) and hands it to the PC; switching off
// removes it from the PC and deletes it.
import { api, renewTokenIfNeeded } from '../api/client';
import { getToken } from '../api/config';

export type AutomationStatus = { on: boolean; main: boolean; declined?: boolean; last_cycle: string; errors: string[]; token_id: string };

const PERMISSIONS = {
	tasks: ['read_all', 'read_one', 'read', 'update'],
	tasks_labels: ['create', 'delete', 'read_all', 'update_bulk'],
	labels: ['create', 'delete', 'read_all', 'read_one', 'update'],
	projects: ['read_all', 'read_one', 'update'],
	filters: ['read_one', 'update']
};

async function pc(method: 'GET' | 'POST', body?: unknown): Promise<AutomationStatus> {
	await renewTokenIfNeeded().catch(() => undefined);
	const res = await fetch('/automations', {
		method,
		headers: { Authorization: `Bearer ${getToken() ?? ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	if (res.status === 404) throw new Error('the PC does not offer this yet');
	if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
	return (await res.json()) as AutomationStatus;
}

export const automationStatus = () => pc('GET');

export async function switchAutomations(on: boolean, current: AutomationStatus | null): Promise<AutomationStatus> {
	if (on) {
		const t = await api.put<{ id: number; token: string }>('/api/v1/tokens', {
			title: 'Tasks automations (PC)',
			expires_at: '2099-12-31T23:59:59Z',
			permissions: PERMISSIONS
		});
		try {
			return await pc('POST', { on: true, token: t.token, token_id: t.id });
		} catch (e) {
			await api.delete(`/api/v1/tokens/${t.id}`).catch(() => undefined); // not kept anywhere: remove it
			throw e;
		}
	}
	const st = await pc('POST', { on: false });
	const id = current?.token_id;
	if (id) await api.delete(`/api/v1/tokens/${id}`).catch(() => undefined);
	return st;
}

let tried = false;
/** On by default: once per session, switches them on if they are off and were never switched off. */
export async function automationsOnByDefault(): Promise<void> {
	if (tried || typeof window === 'undefined') return;
	tried = true;
	try {
		const st = await automationStatus();
		if (!st.on && !st.main && st.declined === false) await switchAutomations(true, st);
	} catch {
		/* PC unreachable, older PC tools, signed out: next session */
	}
}
