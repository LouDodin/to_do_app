<script lang="ts">
	// Home page. The view (All / Pro / Perso) is chosen in the top bar (the Inbox is its own page,
	// /inbox, since 13 Nov 2026). It shows a filter box at the top, then
	// today's actionable tasks in blocks: Today, This week (the week's list), Red, Available. As soon as something is typed or
	// chosen in the filter box, the matching tasks of the view replace the blocks (25 Oct 2026);
	// the former list of "all the other tasks" is gone.
	import { liveState } from '../lib/db/live.svelte';
	import { getHomeBlocks } from '../lib/db/queries';
	import { areaFilter } from '../lib/stores/areaFilter.svelte';
	import TaskList from '../lib/components/TaskList.svelte';
	import SelfFilterBar from '../lib/components/SelfFilterBar.svelte';
	import { selfFilter } from '../lib/stores/selfFilter.svelte';
	import { isActive, matchSelfFilter } from '../lib/utils/selfFilter';
	import { db } from '../lib/db/schema';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import NewTaskDialog from '../lib/components/NewTaskDialog.svelte';
	import Icon from '../lib/components/Icon.svelte';

	// + next to each block (19 Nov 2026, Lou #566): a new task with that block's label.
	const BLOCK_LABEL: Record<string, string> = { Today: 'today', 'This week': 'week', Red: 'p1', Available: 'next-action' };
	let adding = $state<string | null>(null);

	const blocks = liveState(
		() => {
			const view = areaFilter.area;
			return getHomeBlocks(view).then((b) => ({ ...b, view: view as string }));
		},
		{ today: [], week: [], red: [], available: [], all: [], pool: [], unsorted: [], view: '' as string }
	);
	const projects = liveState(() => db.projects.toArray(), []);
	// Searched in the whole view (All, Perso or Pro), Today, Red and Available included.
	const filtering = $derived(isActive(selfFilter.value));
	const filtered = $derived(filtering ? blocks.value.pool.filter((t) => matchSelfFilter(t, selfFilter.value, projects.value)) : []);
	const openCount = $derived(filtered.filter((t) => !t.done).length);

	// Old links to the Inbox view (/?view=inbox) open the Inbox page (13 Nov 2026).
	onMount(() => {
		const q = new URLSearchParams(location.search).get('view')?.toLowerCase();
		if (q === 'inbox' || q === 'input') goto('/inbox', { replaceState: true });
	});

	// Today's open-task count in the browser tab title.
	const pageTitle = $derived(
		blocks.value.today.length > 0 ? `(${blocks.value.today.length}) Tasks` : 'Tasks'
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<div class="home page">
		<div class="finder">
			<SelfFilterBar count={openCount} />
		</div>
		{#if filtering}
			<section class="results" aria-label="Matching tasks">
				<TaskList tasks={filtered} emptyLabel="No task matches" simple completed="hide" />
			</section>
		{:else}
			<section>
				<div class="block-head"><h2 class="section-title">Today</h2><button class="plus" onclick={() => (adding = 'Today')} aria-label="New task in Today" title="New task here"><Icon name="plus" size={14} /></button></div>
				<TaskList tasks={blocks.value.today} emptyLabel="Nothing for today" simple completed="hide" />
			</section>

			<section>
				<div class="block-head"><h2 class="section-title">This week</h2><button class="plus" onclick={() => (adding = 'This week')} aria-label="New task in This week" title="New task here"><Icon name="plus" size={14} /></button></div>
				<TaskList tasks={blocks.value.week} emptyLabel="Nothing planned for the week" simple completed="hide" />
			</section>

			<section>
				<div class="block-head"><h2 class="section-title">Red</h2><button class="plus" onclick={() => (adding = 'Red')} aria-label="New task in Red" title="New task here"><Icon name="plus" size={14} /></button></div>
				<TaskList tasks={blocks.value.red} emptyLabel="Nothing urgent" simple completed="hide" />
			</section>

			<section>
				<div class="block-head"><h2 class="section-title">Available</h2><button class="plus" onclick={() => (adding = 'Available')} aria-label="New task in Available" title="New task here"><Icon name="plus" size={14} /></button></div>
				<TaskList tasks={blocks.value.available} emptyLabel="Nothing available" simple completed="hide" />
			</section>
		{/if}
</div>

{#if adding}
	<NewTaskDialog labelTitles={[BLOCK_LABEL[adding]]} onClose={() => (adding = null)} />
{/if}

<style>
	.block-head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 6px;
	}
	.block-head .section-title {
		margin: 0;
	}
	.plus {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border-radius: 6px;
		color: var(--text-faint);
		opacity: 0;
		transition: opacity 0.12s;
	}
	section:hover .plus,
	.plus:focus-visible {
		opacity: 1;
	}
	.plus:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
	@media (hover: none) {
		.plus {
			opacity: 0.7;
			width: 36px;
			height: 36px;
			margin: -6px 0;
		}
	}
	.home {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.finder {
		margin-top: 14px;
	}
	section.results {
		margin-top: 4px;
	}
	section {
		margin-top: 18px;
	}
</style>
