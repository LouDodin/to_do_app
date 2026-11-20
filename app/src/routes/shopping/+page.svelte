<script lang="ts">
	// Shopping list (6 Nov 2026): every open task ticked 🛒, grouped by shop (its other labels),
	// with a box to add an item. Tap the circle to tick an item off; ticked ones stay at the bottom
	// for a day, so a wrong tap is easy to undo.
	import { liveState } from '../../lib/db/live.svelte';
	import { db } from '../../lib/db/schema';
	import { isShopping, addShoppingItem, SHOPPING_LABEL } from '../../lib/actions/shopping';
	import { completeTask } from '../../lib/actions/tasks';
	import { visibleLabels } from '../../lib/utils/context';
	import { toastStore } from '../../lib/stores/toast.svelte';
	import type { VikunjaTask } from '../../lib/types';

	const SYSTEM = new Set([SHOPPING_LABEL, 'today', 'next-action', 'p1', 'overdue', 'last-day', 'waiting-for', 'urgent', 'week']);
	const items = liveState(() => db.tasks.filter((t) => isShopping(t)).toArray(), []);
	const DAY = 86_400_000;
	const open = $derived(items.value.filter((t) => !t.done));
	const ticked = $derived(
		items.value
			.filter((t) => t.done && Date.now() - Date.parse(t.done_at ?? '') < DAY)
			.sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? ''))
	);
	const shopOf = (t: VikunjaTask) => visibleLabels(t.labels).find((l) => !SYSTEM.has(l.title.trim().toLowerCase()))?.title ?? '';
	const groups = $derived.by(() => {
		const g = new Map<string, VikunjaTask[]>();
		for (const t of [...open].sort((a, b) => a.title.localeCompare(b.title))) {
			const k = shopOf(t);
			g.set(k, [...(g.get(k) ?? []), t]);
		}
		return [...g.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
	});

	let draft = $state('');
	async function add() {
		const title = draft.trim();
		if (!title) return;
		draft = '';
		await addShoppingItem(title);
	}
	async function tick(t: VikunjaTask, done: boolean) {
		await completeTask(t.id, done);
		if (done) toastStore.success(`${t.title}: ticked off`);
	}
</script>

<svelte:head>
	<title>Shopping — Tasks</title>
</svelte:head>

<div class="shopping page">
	<header>
		<h1>Shopping</h1>
		<p class="intro">{open.length} to buy</p>
	</header>

	<form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
		<input type="text" bind:value={draft} placeholder="Add to the shopping list…" aria-label="Add to the shopping list" enterkeyhint="done" />
		{#if draft.trim()}<button class="btn btn-primary" type="submit">Add</button>{/if}
	</form>

	{#if !open.length}
		<p class="empty">Nothing to buy</p>
	{/if}
	{#each groups as [shop, list] (shop)}
		<section>
			<h2>{shop || 'Anywhere'}</h2>
			<ul>
				{#each list as t (t.id)}
					<li>
						<button class="tick" onclick={() => tick(t, true)} aria-label="Tick off {t.title}"></button>
						<a href="/task/{t.id}">{t.title}</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if ticked.length}
		<section class="done">
			<h2>Ticked off (last 24 h)</h2>
			<ul>
				{#each ticked as t (t.id)}
					<li>
						<button class="tick on" onclick={() => tick(t, false)} aria-label="Put {t.title} back on the list">✓</button>
						<a href="/task/{t.id}">{t.title}</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.shopping {
		max-width: 640px;
	}
	h1 {
		margin: 4px 0 2px;
	}
	.intro {
		margin: 0 0 16px;
		color: var(--text-dim);
		font-size: var(--fs-sm);
	}
	.add {
		display: flex;
		gap: 8px;
		margin-bottom: 18px;
	}
	.add input {
		flex: 1;
	}
	h2 {
		font-size: var(--fs-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin: 18px 0 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--border);
	}
	li a {
		color: var(--text);
		text-decoration: none;
		flex: 1;
		font-size: var(--fs-md);
	}
	.tick {
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1.5px solid var(--border-strong);
		display: grid;
		place-items: center;
		font-size: 13px;
		color: var(--accent-contrast);
	}
	.tick.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.done li a {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.empty {
		color: var(--text-faint);
	}
</style>
