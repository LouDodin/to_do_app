import { liveQuery, type Subscription } from 'dexie';

// Bridges a Dexie liveQuery (fires whenever the underlying IndexedDB tables
// change — including from the sync engine's background writes) into a
// Svelte 5 rune. Call from a component with $effect-driven cleanup:
//
//   const tasks = liveState(() => db.tasks.where('project_id').equals(id).toArray(), []);
//   // tasks.value is always current
//
export function liveState<T>(queryFn: () => Promise<T> | T, initial: T) {
	let value = $state<T>(initial);
	let sub: Subscription | undefined;

	$effect(() => {
		// Dexie runs the query function asynchronously, outside this effect,
		// so Svelte can't see which reactive values it reads (a route param,
		// the Pro/Perso toggle...). The result: navigating from one project
		// to another reused the page but kept showing the old project's data.
		// Calling the function once here, synchronously, lets Svelte track
		// those reads and re-subscribe whenever any of them changes. The
		// result is discarded — liveQuery below does the real work.
		try {
			Promise.resolve(queryFn()).catch(() => {});
		} catch {
			/* the liveQuery below reports real errors */
		}
		sub = liveQuery(queryFn).subscribe({
			next: (v) => (value = v),
			error: (err) => console.error('liveQuery error', err)
		});
		return () => sub?.unsubscribe();
	});

	return {
		get value() {
			return value;
		}
	};
}
