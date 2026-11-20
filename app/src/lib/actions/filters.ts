import { settings } from '../stores/settings.svelte';
import { legacyOrder } from '../utils/filterOrder';
import { db } from '../db/schema';
import { queueWrite, nextTempId } from '../db/sync';
import { toastStore } from '../stores/toast.svelte';

export async function createFilter(title: string, filterString: string): Promise<number> {
	const id = nextTempId();
	// A new filter always goes to the bottom. If the order was never written down, do that first.
	const existing = await db.filters.toArray();
	if (settings.filterOrder.length === 0 && existing.length) settings.setFilterOrder(legacyOrder(existing).map((f) => f.id));
	settings.setFilterOrder([...settings.filterOrder, id]);
	await db.filters.put({ id, title, filters: { filter: filterString } });
	await queueWrite({
		entity: 'filter',
		op: 'create',
		targetId: id,
		payload: { title, filters: { filter: filterString } }
	});
	toastStore.success(`Filter "${title}" created`);
	return id;
}

export async function updateFilter(id: number, title: string, filterString: string): Promise<void> {
	await db.filters.update(id, { title, filters: { filter: filterString } });
	await queueWrite({
		entity: 'filter',
		op: 'update',
		targetId: id,
		payload: { title, filters: { filter: filterString } }
	});
}

export async function deleteFilter(id: number): Promise<void> {
	const filter = await db.filters.get(id);
	await db.filters.delete(id);
	await queueWrite({ entity: 'filter', op: 'delete', targetId: id, payload: null });
	toastStore.success(`Filter "${filter?.title ?? ''}" deleted`);
}
