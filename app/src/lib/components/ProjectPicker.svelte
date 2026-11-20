<script lang="ts">
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { isBinProject } from '../utils/bin';
	import { treeOrder } from '../utils/projectOrder';
	import { inferredContext } from '../utils/context';
	import NewProjectDialog from './NewProjectDialog.svelte';
	import type { VikunjaProject } from '../types';

	let {
		onSelect,
		onClose,
		includePending = true,
		excludeIds = [],
		onNone
	}: {
		onSelect: (project: VikunjaProject) => void;
		onClose: () => void;
		includePending?: boolean;
		// Projects to hide from the list — e.g. a project being moved and its
		// own descendants, so it can't be dropped inside itself.
		excludeIds?: number[];
		// When given, a "Back to Inbox" entry is listed first.
		onNone?: () => void;
	} = $props();

	let query = $state('');
	let inputEl: HTMLInputElement;
	const allProjects = liveState(() => db.projects.toArray(), []);

	const byId = $derived(new Map(allProjects.value.map((p) => [p.id, p])));
	// Same order as the left panel: Perso, then Pro, then the rest; sub-projects under their parent.
	const ordered = $derived(
		treeOrder(
			allProjects.value.filter((p) => p.id > 0 && !p.is_archived && !isBinProject(p)),
			(p) => ({ Perso: 0, Pro: 1 })[inferredContext(p.id, byId) as 'Perso' | 'Pro'] ?? 2
		)
	);
	const filtered = $derived(
		ordered
			.map((o) => o.project)
			.filter((p) => p.id > 0 && !p.is_archived && !(p.title.toLowerCase() === 'inbox' && !p.parent_project_id) && !isBinProject(p))
			.filter((p) => includePending || !p.is_pending)
			.filter((p) => !excludeIds.includes(p.id))
			.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
	);

	const depthOf = $derived(new Map(ordered.map((o) => [o.project.id, o.depth])));
	let showNew = $state(false);

	$effect(() => {
		inputEl?.focus();
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="popover" role="dialog" aria-label="Choose a project">
	<input
		bind:this={inputEl}
		type="text"
		placeholder="Search a project…"
		bind:value={query}
	/>
	<div class="list">
		{#if onNone && !query}
			<button
				class="option none"
				onclick={() => {
					onNone();
					onClose();
				}}>Back to Inbox</button
			>
		{/if}
		<button class="option none last" onclick={() => (showNew = true)}>New project</button>
		{#each filtered as project (project.id)}
			<button
				class="option"
				style:padding-left="{10 + (query ? 0 : (depthOf.get(project.id) ?? 0) * 14)}px"
				onclick={() => {
					onSelect(project);
					onClose();
				}}
			>
				{project.title}
				{#if project.is_pending}<span class="badge">pending</span>{/if}
			</button>
		{/each}
		{#if filtered.length === 0}
			<div class="empty">No matching projects</div>
		{/if}
	</div>
</div>

{#if showNew}
	<NewProjectDialog
		initialTitle={query.trim()}
		onCreated={async (id) => {
			const created = await db.projects.get(id);
			if (created) onSelect(created);
		}}
		onClose={() => {
			showNew = false;
			onClose();
		}}
	/>
{/if}

<style>
	.popover {
		position: absolute;
		z-index: 50;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		padding: 10px;
		width: 260px;
	}
	input {
		width: 100%;
		margin-bottom: 6px;
	}
	.list {
		max-height: var(--list-max, 240px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-radius: var(--radius);
		font-size: var(--fs-sm);
		text-align: left;
	}
	.option:hover {
		background: var(--bg-hover);
	}
	.badge {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 4px;
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-xs);
		padding: 4px;
	}
	.none {
		color: var(--text-dim);
		border-radius: var(--radius);
	}
	.none.last {
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		margin-bottom: 4px;
	}
	.create {
		border-top: 1px solid var(--border);
		border-radius: 0;
		margin-top: 4px;
	}
</style>
