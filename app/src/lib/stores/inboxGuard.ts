// Inbox safety net (19 Oct 2026). A task given a project in the Inbox view must stay there until
// you validate it yourself. The app flags it ("to validate") when it leaves the Inbox project; if
// that flag is ever lost on the way (another device, an old version, a server reply), the task
// would silently leave the Inbox view. So every task moved out of the Inbox project on this device
// is remembered for a day: while remembered and not validated, it stays in the Inbox view, and the
// flag is put back.
const KEY = 'inbox_moved';
const KEEP_MS = 24 * 60 * 60 * 1000;

function read(): Record<string, number> {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}
function write(v: Record<string, number>) {
	try {
		localStorage.setItem(KEY, JSON.stringify(v));
	} catch {
		// not remembered
	}
}

/** Ids of tasks moved out of the Inbox project on this device and not validated since. */
export function movedOutOfInbox(now = Date.now()): Set<number> {
	if (typeof localStorage === 'undefined') return new Set();
	const all = read();
	const fresh = Object.entries(all).filter(([, t]) => now - t < KEEP_MS);
	if (fresh.length !== Object.keys(all).length) write(Object.fromEntries(fresh));
	return new Set(fresh.map(([id]) => Number(id)));
}

export function rememberMovedOut(id: number) {
	if (typeof localStorage === 'undefined') return;
	write({ ...read(), [id]: Date.now() });
}

/** Validated, completed or deleted: no longer kept in the Inbox view. */
export function forgetMovedOut(id: number) {
	if (typeof localStorage === 'undefined') return;
	const v = read();
	if (id in v) {
		delete v[id];
		write(v);
	}
}

/** A task got a server id: follow it. */
export function remapMovedOut(from: number, to: number) {
	if (typeof localStorage === 'undefined') return;
	const v = read();
	if (from in v) {
		v[to] = v[from];
		delete v[from];
		write(v);
	}
}
