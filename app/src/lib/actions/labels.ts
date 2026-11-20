import { db } from '../db/schema';
import { queueWrite, nextTempId } from '../db/sync';
import { toastStore } from '../stores/toast.svelte';

export async function createLabel(title: string, hexColor: string): Promise<number> {
	const id = nextTempId();
	await db.labels.put({ id, title, hex_color: hexColor.replace('#', '') });
	await queueWrite({
		entity: 'label',
		op: 'create',
		targetId: id,
		payload: { title, hex_color: hexColor.replace('#', '') }
	});
	toastStore.success(`Label "${title}" created`);
	return id;
}

export async function updateLabel(
	id: number,
	changes: { title?: string; hex_color?: string }
): Promise<void> {
	const patch = { ...changes };
	if (patch.hex_color) patch.hex_color = patch.hex_color.replace('#', '');
	await db.labels.update(id, patch);
	await queueWrite({ entity: 'label', op: 'update', targetId: id, payload: patch });
	// Keep this label's embedded copy on every task in sync straight away —
	// otherwise a renamed/recoloured label looks stale on task rows until
	// the next background pull refreshes them from the server.
	const affected = await db.tasks.filter((t) => !!t.labels?.some((l) => l.id === id)).toArray();
	await db.transaction('rw', db.tasks, async () => {
		for (const t of affected) {
			await db.tasks.update(t.id, {
				labels: t.labels!.map((l) => (l.id === id ? { ...l, ...patch } : l))
			});
		}
	});
}

export async function deleteLabel(id: number): Promise<void> {
	const label = await db.labels.get(id);
	await db.labels.delete(id);
	await queueWrite({ entity: 'label', op: 'delete', targetId: id, payload: null });
	// Strip the now-deleted label from every task's embedded copy, so it
	// doesn't linger as a ghost chip until the next background pull.
	const affected = await db.tasks.filter((t) => !!t.labels?.some((l) => l.id === id)).toArray();
	await db.transaction('rw', db.tasks, async () => {
		for (const t of affected) {
			await db.tasks.update(t.id, { labels: t.labels!.filter((l) => l.id !== id) });
		}
	});
	toastStore.success(`Label "${label?.title ?? ''}" deleted`);
}

/** The id of the label with this name (any case), created the first time. */
export async function ensureLabel(title: string, hexColor: string): Promise<number> {
	const found = await db.labels.filter((l) => l.title.trim().toLowerCase() === title.toLowerCase()).first();
	return found ? found.id : createLabel(title, hexColor);
}
