<script lang="ts">
	// A saved Vikunja filter, evaluated on the device (works offline too).
	// (This page was found empty on 10 Oct 2026: saved filters showed a blank page.)
	import { page } from '$app/state';
	import { db } from '../../../lib/db/schema';
	import { liveState } from '../../../lib/db/live.svelte';
	import { compileFilter, makeResolver } from '../../../lib/utils/filterEval';
	import TaskList from '../../../lib/components/TaskList.svelte';
	import type { VikunjaTask } from '../../../lib/types';
	import { isTaskPending } from '../../../lib/utils/context';

	const filterId = $derived(Number(page.params.id));
	const filter = liveState(() => db.filters.get(filterId), undefined);
	const labels = liveState(() => db.labels.toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	// Pending (on hold) tasks are left out (13 Nov 2026): they only show in their project, when asked.
	const allTasks = liveState(() => db.tasks.filter((t) => t.done || !isTaskPending(t)).toArray(), [] as VikunjaTask[]);

	// Completed tasks are included: TaskList's own show/hide-completed toggle decides.
	const result = $derived.by(() => {
		const f = filter.value;
		if (!f) return { tasks: [] as VikunjaTask[], error: '' };
		const query = f.filters?.filter ?? '';
		if (!query.trim()) return { tasks: allTasks.value, error: '' };
		try {
			const match = compileFilter(query, makeResolver(labels.value, projects.value));
			return { tasks: allTasks.value.filter((t) => match(t)), error: '' };
		} catch (e) {
			return { tasks: [] as VikunjaTask[], error: e instanceof Error ? e.message : String(e) };
		}
	});
</script>

<svelte:head>
	<title>{filter.value ? `${filter.value.title} — Tasks` : 'Tasks'}</title>
</svelte:head>

{#if filter.value}
	<div class="filter-page">
		<h1>{filter.value.title}</h1>
		{#if filter.value.filters?.filter}<p class="query" title="Filter definition">{filter.value.filters.filter}</p>{/if}
		{#if result.error}
			<p class="error">This filter uses something the app cannot evaluate ({result.error}). Edit it, or open it in Vikunja.</p>
		{:else}
			<TaskList tasks={result.tasks} emptyLabel="No task matches this filter" />
		{/if}
	</div>
{:else}
	<div class="not-found">Filter not found (it may still be syncing).</div>
{/if}

<style>
	.filter-page {
		padding: 20px 24px 96px;
	}
	h1 {
		font-size: var(--fs-xl);
		margin: 0 0 4px;
	}
	.query {
		margin: 0 0 16px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}
	.error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.not-found {
		padding: 40px;
		text-align: center;
		color: var(--text-faint);
	}
	@media (max-width: 640px) {
		.filter-page {
			padding: 16px 16px 96px;
		}
	}
</style>
