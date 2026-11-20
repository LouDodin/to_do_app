// A change the server refuses because it is ALREADY the case is not a failure (4 Nov 2026): a
// delete of something already gone (404), a relation or a label already there (409 / 400
// "already exists"), a relation or a label already removed (404). These were reported as
// "A change could not be synced" and raised "Device errors" for nothing.
import type { QueuedWrite } from './schema';

export function alreadyDone(op: QueuedWrite['op'], status: number, message: string): boolean {
	const exists = /already exist/i.test(message);
	const missing = status === 404 || /does not exist|not found/i.test(message);
	switch (op) {
		case 'delete':
		case 'removeLabel':
		case 'removeRelation':
			return missing;
		case 'addLabel':
		case 'addRelation':
			return (status === 409 || status === 400) && exists;
		default:
			return false;
	}
}
