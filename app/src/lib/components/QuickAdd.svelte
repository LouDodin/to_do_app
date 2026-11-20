<script lang="ts">
	import Icon from './Icon.svelte';
	// "New task" (19 Oct 2026): one text box. What you type becomes the title of a new task in the
	// Inbox, where you define it later (project, labels, dates). Nothing is read from the text.
	// Enter adds it and closes; Ctrl/⌘+Enter adds it and keeps the box open for the next one.
	import { createTask } from '../actions/tasks';
	import { toastStore } from '../stores/toast.svelte';
	import { getInboxProject } from '../db/queries';
	import { addShoppingItem } from '../actions/shopping';

	let {
		onDone,
		initialTitle = '',
		initialDescription = ''
	}: { compact?: boolean; onDone?: () => void; initialTitle?: string; initialDescription?: string } = $props();

	let titleEl: HTMLInputElement | undefined = $state();
	// svelte-ignore state_referenced_locally
	let title = $state(initialTitle);
	// A link or text shared from another app (Android "Share to Tasks") is kept as the notes.
	// svelte-ignore state_referenced_locally
	let description = initialDescription;
	let busy = $state(false);
	// 🛒 ticked: a shopping item, straight on the Shopping list (skips the Inbox).
	let shopping = $state(false);

	// Cursor in the box as soon as the window opens. SvelteKit moves the focus back to <body>
	// once it has finished starting up, which used to steal it: focus again if so.
	$effect(() => {
		const el = titleEl;
		if (!el) return;
		el.focus();
		const timers = [60, 200, 600].map((ms) =>
			setTimeout(() => {
				if (document.activeElement === document.body || document.activeElement === null) el.focus();
			}, ms)
		);
		return () => timers.forEach(clearTimeout);
	});

	async function submit(keepOpen = false) {
		const raw = title.trim();
		if (!raw || busy) return;
		busy = true;
		try {
			if (shopping) {
				await addShoppingItem(raw, description || undefined);
				toastStore.success('Added to the shopping list');
				title = '';
				description = '';
				if (keepOpen) titleEl?.focus();
				else onDone?.();
				return;
			}
			const inbox = await getInboxProject();
			if (!inbox) {
				toastStore.error('No Inbox project yet: wait for the first sync, then try again.');
				return;
			}
			await createTask({
				title: raw,
				project_id: inbox.id,
				description: description || undefined,
				start_date: new Date().toISOString(),
				due_date: null
				// Not validated: it waits in the Inbox view until you validate it.
			});
			toastStore.success('Added to the Inbox');
			title = '';
			description = '';
			if (keepOpen) titleEl?.focus();
			else onDone?.();
		} finally {
			busy = false;
		}
	}
</script>

<form class="quick-add" onsubmit={(e) => { e.preventDefault(); submit(); }}>
	<input
		type="text"
		class="title-input"
		placeholder="New task"
		aria-label="New task"
		enterkeyhint="done"
		autocomplete="off"
		bind:this={titleEl}
		bind:value={title}
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit(e.metaKey || e.ctrlKey);
			}
		}}
	/>
	<button
		type="button"
		class="cart"
		class:on={shopping}
		aria-pressed={shopping}
		aria-label="Shopping"
		title="Add it to the Shopping list"
		onclick={() => {
			// 13 Nov 2026: with something typed, 🛒 adds it to the Shopping list at once (no Add to click).
			if (title.trim()) {
				shopping = true;
				void submit();
				return;
			}
			shopping = !shopping;
			titleEl?.focus();
		}}><Icon name="cart" size={16} /></button
	>
	<button type="submit" class="add" disabled={!title.trim() || busy} aria-label={shopping ? 'Add to the shopping list' : 'Add to the Inbox'}>Add</button>
</form>

<style>
	.quick-add {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 10px 10px 16px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--bg);
	}
	.quick-add:focus-within {
		border-color: var(--text);
	}
	.title-input {
		flex: 1;
		min-width: 0;
		height: auto;
		font-size: var(--fs-lg);
		padding: 4px 0;
		border: none;
		border-radius: 0;
		background: transparent;
	}
	.title-input:focus {
		outline: none;
	}
	/* The cart (a grey line icon like the others, 14 Nov 2026) shaped like the Add button next to it (13 Nov 2026): same height and corners, a quiet
	   outline; once ticked, filled like Add. */
	.cart {
		height: var(--control-h);
		padding: 0 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border-strong);
		background: var(--bg);
		color: var(--text-dim);
		display: inline-flex;
		align-items: center;
	}
	.cart:hover {
		background: var(--bg-hover);
	}
	.cart.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}
	.add {
		height: var(--control-h);
		padding: 0 14px;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.add:disabled {
		opacity: 0.35;
	}
</style>
