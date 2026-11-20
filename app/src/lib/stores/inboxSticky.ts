// The Inbox view never loses a task on screen unless you took it out yourself (validated,
// completed or binned it). 21 Oct 2026: on one PC, a task given a project vanished from the
// Inbox until the app was reloaded, although the server still had it "to validate"; it could not
// be reproduced elsewhere. So within a session, a task once shown in the Inbox stays there until
// one of those actions, and each such case is written to the error report ("trace") with what
// the device had, so the cause can be found.
const shown = new Set<number>();
const released = new Set<number>();
const traced = new Set<number>();

export function markShown(ids: number[]): void {
	for (const id of ids) shown.add(id);
}
/** Validated, completed, binned or deleted by you: may leave the Inbox view. */
export function releaseFromInbox(id: number): void {
	released.add(id);
}
export function keepInInbox(id: number): boolean {
	return shown.has(id) && !released.has(id);
}
export function firstTrace(id: number): boolean {
	if (traced.has(id)) return false;
	traced.add(id);
	return true;
}
/** Sent back to the Inbox: sticky again. */
export function backToInbox(id: number): void {
	released.delete(id);
}
