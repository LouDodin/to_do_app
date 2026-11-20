// "Download my data" and its monthly reminder (26 Oct 2026). See utils/exportData.ts.
import { db } from '../db/schema';
import { tasksCsv, completeJson, fileStamp } from '../utils/exportData';
import { toastStore } from './toast.svelte';

const LAST = 'my_data_last';
const SINCE = 'my_data_since'; // when this device first had the feature: the reminder counts from there
const NUDGED = 'my_data_nudged';
const DAY = 86_400_000;
export const REMIND_DAYS = 30;

const get = (k: string) => {
	try {
		return Number(localStorage.getItem(k)) || 0;
	} catch {
		return 0;
	}
};
const set = (k: string, v: number) => {
	try {
		localStorage.setItem(k, String(v));
	} catch {
		/* not remembered */
	}
};

/** When this device last downloaded a copy (0 = never). */
export function lastCopy(): number {
	return get(LAST);
}

function save(name: string, text: string, type: string) {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadMyData(kind: 'table' | 'complete'): Promise<number> {
	const [tasks, bin, projects, labels, filters] = await Promise.all([db.tasks.toArray(), db.bin.toArray(), db.projects.toArray(), db.labels.toArray(), db.filters.toArray()]);
	const input = { tasks, bin, projects: projects.filter((p) => p.id > 0 || p.title), labels, filters, build: __APP_BUILD__ };
	const stamp = fileStamp();
	if (kind === 'table') save(`my-tasks-${stamp}.csv`, tasksCsv(input), 'text/csv;charset=utf-8');
	else save(`my-tasks-complete-${stamp}.json`, completeJson(input), 'application/json');
	set(LAST, Date.now());
	return tasks.length + bin.length;
}

/** Once a week at most, when the last copy is more than a month old: a short reminder. */
export function remindIfDue(openHelp: () => void): void {
	if (typeof localStorage === 'undefined') return;
	const now = Date.now();
	if (!get(SINCE)) set(SINCE, now);
	const from = get(LAST) || get(SINCE);
	if (now - from < REMIND_DAYS * DAY || now - get(NUDGED) < 7 * DAY) return;
	set(NUDGED, now);
	const days = Math.floor((now - from) / DAY);
	toastStore.show(get(LAST) ? `Your last copy of your data is ${days} days old.` : 'You have not downloaded a copy of your data yet.', 'info', {
		durationMs: 12_000,
		action: { label: 'Help', onClick: openHelp }
	});
}
