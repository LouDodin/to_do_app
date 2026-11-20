// Older first: creation time, then (same second) a task not sent yet is the newer one, then the id
// (server ids grow; temporary ids, negative, shrink with time). A task keeps its place when it is
// sent to the server and gets its real id.
type T = { created?: string; id: number };
const createdAt = (t: T) => (t.created ? Date.parse(t.created) || 0 : 0);
export const olderFirst = (a: T, b: T) =>
	createdAt(a) - createdAt(b) || Number(a.id < 0) - Number(b.id < 0) || (a.id < 0 ? b.id - a.id : a.id - b.id);
