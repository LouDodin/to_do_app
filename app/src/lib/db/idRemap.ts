// A task created offline-first has a temporary id until the server saves it. The task
// page uses this to follow the task to its real id instead of showing "not found".
const remap = new Map<number, number>();

export function rememberRemap(temp: number, real: number): void {
	remap.set(temp, real);
}

export function remappedId(id: number): number | undefined {
	return remap.get(id);
}

// Resolves with the real id once the server has saved the task (or the temp id after `ms`, e.g. offline).
export async function waitForRealId(temp: number, nudge?: () => void, ms = 8000): Promise<number> {
	const start = Date.now();
	let last = 0;
	while (Date.now() - start < ms) {
		const real = remap.get(temp);
		if (real) return real;
		if (nudge && Date.now() - last > 1000) {
			last = Date.now();
			nudge();
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return temp;
}
