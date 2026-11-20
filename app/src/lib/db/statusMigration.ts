// One-time marking for the new validation status (19 Oct 2026, see utils/context.ts).
// Every open task that is validated the old way (no "ctx:review", not in the Inbox project)
// gets the new "ctx:validated" mark; tasks still to validate get nothing and stay in the Inbox.
// Runs once per account, from the first device that syncs with this version; the account then
// remembers it (frontend setting "tasks_status_v2"), and the other devices just switch over.
import { setFrontendSetting } from '../api/userSettings';
import { api } from '../api/client';
import { labelsApi, tasksApi } from '../api/endpoints';
import { db } from './schema';
import { VALIDATED_LABEL, REVIEW_LABEL, validatedMarkInUse, setValidatedMarkInUse } from '../utils/context';
import { tasksToMark, oldFlagFixes } from '../utils/statusMark';
import type { VikunjaLabel, VikunjaProject, VikunjaTask } from '../types';

const SETTING = 'tasks_status_v2';
type UserSettings = { frontend_settings?: Record<string, unknown> } & Record<string, unknown>;
let running = false;

// The lists are live queries on the tasks table: rewriting one row makes them recompute with
// the new rule.
async function refreshViews() {
	const t = await db.tasks.limit(1).first();
	if (t) await db.tasks.put(t);
}

async function validatedLabel(): Promise<VikunjaLabel> {
	const find = async () =>
		(await labelsApi.all()).filter((l) => l.title.toLowerCase() === VALIDATED_LABEL).sort((a, b) => a.id - b.id);
	let found = await find();
	if (!found.length) {
		await labelsApi.create({ title: VALIDATED_LABEL, hex_color: '4caf50' });
		found = await find();
		// Two devices at the same moment: keep the oldest, remove the others.
		for (const extra of found.slice(1)) await labelsApi.delete(extra.id).catch(() => undefined);
	}
	await db.labels.put(found[0]);
	return found[0];
}

/** Called after a complete pull, with what the server just sent. */
export async function runStatusMigration(tasks: VikunjaTask[], projects: VikunjaProject[]): Promise<void> {
	if (running) return;
	if (validatedMarkInUse()) return keepOldFlagRight(tasks, projects);
	running = true;
	try {
		const user = await api.get<{ settings?: UserSettings }>('/api/v1/user');
		if (user.settings?.frontend_settings?.[SETTING] === true) {
			setValidatedMarkInUse(true);
			await refreshViews();
			running = false;
			await keepOldFlagRight(tasks, projects);
			return;
		}
		if ((await db.queue.count()) > 0) return; // next time, with nothing waiting to be sent
		const label = await validatedLabel();
		for (const t of tasksToMark(tasks, projects)) {
			await tasksApi.addLabel(t.id, label.id);
			const local = await db.tasks.get(t.id);
			if (local && !(local.labels ?? []).some((l) => l.id === label.id))
				await db.tasks.update(t.id, { labels: [...(local.labels ?? []), label] });
		}
		await setFrontendSetting(SETTING, true);
		setValidatedMarkInUse(true);
		await refreshViews();
		// (the old flag is put right at the next sync, from a fresh copy of the tasks)
	} catch {
		// offline or refused: tried again after the next sync; the old rule still applies meanwhile
	} finally {
		running = false;
	}
}

// Keeps the old "to validate" flag right for app versions older than 19 Oct 2026 (see
// oldFlagFixes). A few changes per sync at most; nothing to do once every device is up to date.
let fixing = false;
async function keepOldFlagRight(tasks: VikunjaTask[], projects: VikunjaProject[]): Promise<void> {
	if (fixing || (await db.queue.count()) > 0) return;
	const { add, remove } = oldFlagFixes(tasks, projects);
	if (!add.length && !remove.length) return;
	fixing = true;
	try {
		const review = (await db.labels.filter((l) => l.title.toLowerCase() === REVIEW_LABEL && l.id > 0).first()) ??
			(await labelsApi.all()).find((l) => l.title.toLowerCase() === REVIEW_LABEL);
		if (!review) return;
		for (const t of add.slice(0, 30)) {
			await tasksApi.addLabel(t.id, review.id);
			const local = await db.tasks.get(t.id);
			if (local && !(local.labels ?? []).some((l) => l.id === review.id)) await db.tasks.update(t.id, { labels: [...(local.labels ?? []), review] });
		}
		for (const t of remove.slice(0, 30)) {
			await tasksApi.removeLabel(t.id, review.id);
			const local = await db.tasks.get(t.id);
			if (local) await db.tasks.update(t.id, { labels: (local.labels ?? []).filter((l) => l.id !== review.id) });
		}
	} catch {
		/* next sync */
	} finally {
		fixing = false;
	}
}
