// Temporary ids for things created before the server has answered. They must stay unique
// across app restarts (a task created offline, app closed, another created offline...), so
// they are derived from the clock instead of restarting at -1, and they are far below the
// small negative ids the server uses for saved-filter pseudo-projects (-1, -2, ...).
let lastTempId = 0;
export function nextTempId(): number {
	let id = -Date.now() * 1000;
	if (id >= lastTempId) id = lastTempId - 1;
	lastTempId = id;
	return id;
}
