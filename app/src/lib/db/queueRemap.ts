import { db } from './schema';

// Deep-replaces any occurrence of a temp (negative) id with its real,
// server-assigned id inside a write's payload — needed because a task
// created offline may immediately get labels or a relation queued against
// its temporary id before it's ever synced.
export function remapPayload(payload: unknown, idMap: Map<number, number>): unknown {
	if (typeof payload === 'number') return idMap.get(payload) ?? payload;
	if (Array.isArray(payload)) return payload.map((v) => remapPayload(v, idMap));
	if (payload && typeof payload === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(payload)) out[k] = remapPayload(v, idMap);
		return out;
	}
	return payload;
}

// Once the server has given a temporary id its real one, rewrite every write still waiting in
// the queue, so a later flush (after an error, a reload, a restart) targets the real id and
// not the long-gone temporary one.
export async function remapQueuedRows(temp: number, real: number): Promise<void> {
	const one = new Map([[temp, real]]);
	const rows = await db.queue.toArray();
	for (const r of rows) {
		const targetId = r.targetId === temp ? real : r.targetId;
		const payload = remapPayload(r.payload, one);
		if (targetId !== r.targetId || JSON.stringify(payload) !== JSON.stringify(r.payload)) {
			await db.queue.update(r.id!, { targetId, payload });
		}
	}
}
