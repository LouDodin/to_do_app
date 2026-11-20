<script lang="ts">
	// The tasks of one label, or of several (11 Nov 2026): /label/12+15. The labels shown are chips
	// at the top (× takes one off, + adds one); with two or more, "All of them" or "Any of them".
	// The same labels can be added or taken off from the menu, the list follows at once.
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { db } from '../../../lib/db/schema';
	import { liveState } from '../../../lib/db/live.svelte';
	import TaskList from '../../../lib/components/TaskList.svelte';
	import LabelChip from '../../../lib/components/LabelChip.svelte';
	import { parseLabelIds, matchesLabels } from '../../../lib/utils/labelFilter';
	import { isContextLabel, isTaskPending } from '../../../lib/utils/context';
	import { sortLabels } from '../../../lib/utils/labelSort';
	import { settings } from '../../../lib/stores/settings.svelte';
	import { clickOutside } from '../../../lib/actions/clickOutside';

	const ids = $derived(parseLabelIds(decodeURIComponent(page.params.id ?? '')));
	const any = $derived(page.url.searchParams.get('any') === '1');
	const allLabels = liveState(() => db.labels.toArray(), []);
	const byId = $derived(new Map(allLabels.value.map((l) => [l.id, l])));
	const shown = $derived(ids.map((i) => byId.get(i)).filter((l) => !!l));
	// Completed tasks are included: TaskList's own show/hide-completed toggle decides.
	const tasks = liveState(() => {
		const want = ids;
		const anyOf = any;
		// Pending (on hold) tasks are left out (13 Nov 2026).
		return db.tasks.filter((t) => matchesLabels(t, want, anyOf) && (t.done || !isTaskPending(t))).toArray();
	}, []);

	let adding = $state(false);
	let query = $state('');
	const choices = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const rest = allLabels.value.filter((l) => !ids.includes(l.id) && !isContextLabel(l));
		return sortLabels(q ? rest.filter((l) => l.title.toLowerCase().includes(q)) : rest, settings.colorOrder).slice(0, 40);
	});
	function go(next: number[], anyOf = any) {
		if (!next.length) return goto('/');
		goto(`/label/${next.join('+')}${anyOf && next.length > 1 ? '?any=1' : ''}`, { keepFocus: true, noScroll: true });
	}
	function add(id: number) {
		adding = false;
		query = '';
		go([...ids, id]);
	}
</script>

<svelte:head>
	<title>{shown.length ? `${shown.map((l) => l.title).join(' + ')} — Tasks` : 'Tasks'}</title>
</svelte:head>

{#if shown.length}
	<div class="label-page">
		<div class="head">
			{#each shown as l (l.id)}
				<span class="sel">
					<LabelChip label={l} />
					{#if shown.length > 1}<button class="x" onclick={() => go(ids.filter((x) => x !== l.id))} aria-label="Take {l.title} off" title="Take it off">×</button>{/if}
				</span>
			{/each}
			<span class="add-wrap" use:clickOutside={() => (adding = false)}>
				<button class="add" onclick={() => (adding = !adding)} aria-label="Add a label" title="Add a label">+</button>
				{#if adding}
					<div class="pop">
						<!-- svelte-ignore a11y_autofocus -->
						<input placeholder="Find a label…" bind:value={query} autofocus onkeydown={(e) => { if (e.key === 'Enter' && choices[0]) add(choices[0].id); else if (e.key === 'Escape') adding = false; }} />
						<div class="list">
							{#each choices as l (l.id)}
								<button class="opt" onclick={() => add(l.id)}><LabelChip label={l} /></button>
							{:else}
								<div class="none">No other label</div>
							{/each}
						</div>
					</div>
				{/if}
			</span>
			{#if shown.length > 1}
				<div class="mode" role="group" aria-label="Tasks with">
					<button aria-pressed={!any} class:on={!any} onclick={() => go(ids, false)}>All of them</button>
					<button aria-pressed={any} class:on={any} onclick={() => go(ids, true)}>Any of them</button>
				</div>
			{/if}
		</div>
		<TaskList tasks={tasks.value} emptyLabel={shown.length > 1 && !any ? 'No task has all of these labels' : 'No tasks'} />
	</div>
{:else}
	<div class="not-found">Label not found.</div>
{/if}

<style>
	.label-page {
		padding: 20px 24px 60px;
	}
	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 18px;
		font-size: var(--fs-lg);
	}
	.head :global(.chip) {
		font-size: var(--fs-md);
		padding: 3px 12px;
	}
	.sel {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.x {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		color: var(--text-faint);
		font-size: 16px;
		line-height: 1;
	}
	.x:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.add-wrap {
		position: relative;
	}
	.add {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		border: 1px dashed var(--border-strong, var(--border));
		color: var(--text-dim);
		font-size: 16px;
		line-height: 1;
	}
	.add:hover {
		border-style: solid;
		color: var(--text);
	}
	.pop {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 30;
		width: 260px;
		max-height: 340px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-sm);
	}
	.list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.opt {
		text-align: left;
		padding: 5px 6px;
		border-radius: 6px;
	}
	.opt:hover {
		background: var(--bg-hover);
	}
	.none {
		padding: 6px;
		color: var(--text-faint);
	}
	.mode {
		display: inline-flex;
		margin-left: 6px;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px;
		font-size: var(--fs-xs);
	}
	.mode button {
		padding: 3px 10px;
		border-radius: 999px;
		color: var(--text-dim);
	}
	.mode button.on {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 600;
	}
	.not-found {
		padding: 40px;
		text-align: center;
		color: var(--text-faint);
	}
	@media (max-width: 760px) {
		.label-page {
			padding: 14px 12px 80px;
		}
	}
</style>
