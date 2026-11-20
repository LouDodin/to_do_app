<script lang="ts">
	// One step of a review page (Tomorrow's priorities, Weekly review): a number, a title and (only
	// if given; the review pages give none since 13 Nov 2026) how many things are waiting. A step with nothing waiting shows a tick and folds. On the Weekly
	// review the number is also a tick box (11 Nov 2026): a click marks the step done for the week
	// even if things remain in it (onTick).
	import type { Snippet } from 'svelte';

	let {
		n,
		id = undefined,
		title,
		count = undefined,
		open = undefined,
		ticked = false,
		onTick,
		period = 'for this week',
		children
	}: { n: number; id?: string; title: string; count?: number; open?: boolean; ticked?: boolean; onTick?: () => void; period?: string; children?: Snippet } = $props();

	const clear = $derived(count === 0 || ticked);
	// Folded by default when there is nothing to do; a click on the title opens or folds it.
	let folded = $state<boolean | null>(null);
	const isOpen = $derived(folded === null ? (open ?? !clear) : !folded);
</script>

<section class="step" class:clear data-step={id ?? n}>
	<div class="head">
		{#if onTick}
			<button
				class="num tick"
				onclick={() => {
					folded = null;
					onTick();
				}}
				aria-pressed={ticked}
				aria-label={ticked ? `Step ${n}: not done` : `Step ${n}: done ${period}`}
				title={ticked ? 'Not done' : `Done ${period}`}>{clear ? '✓' : n}</button
			>
		{:else}
			<span class="num" aria-hidden="true">{clear ? '✓' : n}</span>
		{/if}
		<button class="fold" onclick={() => (folded = isOpen)} aria-expanded={isOpen}>
			<span class="title">{title}</span>
			{#if count}<span class="count">{count}</span>{/if}
			<span class="chev" class:up={isOpen} aria-hidden="true">›</span>
		</button>
	</div>
	{#if isOpen && children}
		<div class="body">{@render children()}</div>
	{/if}
</section>

<style>
	.step {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg);
		margin-bottom: 12px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px 0 14px;
		border-radius: var(--radius-lg);
	}
	.head:hover {
		background: var(--bg-hover);
	}
	.fold {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 8px;
		text-align: left;
		color: var(--text);
	}
	.num {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: var(--fs-xs);
		font-weight: 600;
		padding: 0;
	}
	.num.tick {
		cursor: pointer;
		transition: box-shadow 0.12s;
	}
	.num.tick:hover {
		box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 30%, transparent);
	}
	.clear .num {
		background: color-mix(in srgb, #22c55e 16%, transparent);
		color: #16a34a;
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-md);
		font-weight: 600;
	}
	.clear .title {
		color: var(--text-dim);
	}
	.count {
		flex: none;
		min-width: 24px;
		padding: 2px 8px;
		border-radius: 12px;
		background: var(--bg-elevated);
		color: var(--text-dim);
		font-size: var(--fs-xs);
		font-weight: 600;
		text-align: center;
	}
	.chev {
		flex: none;
		color: var(--text-faint);
		transform: rotate(90deg);
		transition: transform 0.15s;
	}
	.chev.up {
		transform: rotate(-90deg);
	}
	.body {
		padding: 0 10px 12px;
	}
	@media (max-width: 760px) {
		.head {
			padding-left: 12px;
		}
		.body {
			padding: 0 8px 10px;
		}
	}
</style>
