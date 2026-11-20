import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { remapPayload, remapQueuedRows } from './queueRemap';

describe('queue id remapping', () => {
	beforeEach(async () => {
		await db.queue.clear();
	});
	it('replaces a temporary id deep inside a payload', () => {
		const m = new Map([[-3, 77]]);
		expect(remapPayload({ otherTaskId: -3, list: [-3, 5], nested: { id: -3 } }, m)).toEqual({ otherTaskId: 77, list: [77, 5], nested: { id: 77 } });
	});
	it('rewrites queued writes that still point at the temporary id', async () => {
		await db.queue.add({ entity: 'task', op: 'setLabels', targetId: -3, payload: { labelIds: [1, 2] }, createdAt: 1 });
		await db.queue.add({ entity: 'task', op: 'addRelation', targetId: 10, payload: { otherTaskId: -3, kind: 'precedes' }, createdAt: 2 });
		await db.queue.add({ entity: 'task', op: 'update', targetId: 11, payload: { title: 'x' }, createdAt: 3 });
		await remapQueuedRows(-3, 900);
		const rows = await db.queue.orderBy('createdAt').toArray();
		expect(rows[0].targetId).toBe(900);
		expect((rows[1].payload as any).otherTaskId).toBe(900);
		expect(rows[2].targetId).toBe(11);
		expect(rows[2].payload).toEqual({ title: 'x' });
	});
});
