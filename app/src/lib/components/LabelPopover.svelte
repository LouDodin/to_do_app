<script lang="ts">
	import { openUpIfNoRoom } from '../actions/openUpIfNoRoom';
	const maybeFlip = (node: HTMLElement) => (flip ? openUpIfNoRoom(node) : undefined);
	// The compact label editor described in the spec ("Gestion des labels
	// sans ouvrir la tâche"): search + autocomplete, assigned labels
	// removable with one click, saved immediately on every action.
	import { db } from '../db/schema';
	import { isContextLabel } from '../utils/context';
	import { liveState } from '../db/live.svelte';
	import { sortLabels } from '../utils/labelSort';
	import { settings } from '../stores/settings.svelte';
	import { addTaskLabel, removeTaskLabel } from '../actions/tasks';
	import { createLabel } from '../actions/labels';
	import LabelChip from './LabelChip.svelte';
	import type { VikunjaLabel } from '../types';

	let {
		taskId,
		assignedLabels,
		onClose,
		flip = false
	}: { taskId: number; assignedLabels: VikunjaLabel[]; onClose: () => void; flip?: boolean } = $props();

	let query = $state('');
	let hi = $state(-1);
	$effect(() => { query; hi = -1; });
	let inputEl: HTMLInputElement;

	const allLabels = liveState(() => db.labels.filter((l) => !isContextLabel(l)).toArray(), []);

	const assignedIds = $derived(new Set(assignedLabels.map((l) => l.id)));
	const filtered = $derived(
		sortLabels(
			allLabels.value.filter((l) => l.title.toLowerCase().includes(query.toLowerCase())),
			settings.colorOrder
		)
	);

	let newColor = $state('5f5ff6');
	const trimmed = $derived(query.trim());
	const canCreate = $derived(
		trimmed.length > 0 && !allLabels.value.some((l) => l.title.toLowerCase() === trimmed.toLowerCase())
	);
	async function createAndAssign() {
		const id = await createLabel(trimmed, newColor);
		await addTaskLabel(taskId, id);
		query = '';
		inputEl?.focus();
	}

	$effect(() => {
		inputEl?.focus();
	});

	function toggle(label: VikunjaLabel) {
		if (assignedIds.has(label.id)) removeTaskLabel(taskId, label.id);
		else addTaskLabel(taskId, label.id);
	}

	// Enter on an existing label assigns it and keeps the window open for the next one;
	// the Exit button (or Escape) closes it.
	async function pick(label: VikunjaLabel) {
		if (!assignedIds.has(label.id)) await addTaskLabel(taskId, label.id);
		query = '';
		hi = -1;
		inputEl?.focus();
	}
	function onEnter(e: KeyboardEvent) {
		e.preventDefault();
		const exact = allLabels.value.find((l) => l.title.toLowerCase() === trimmed.toLowerCase());
		const target = hi >= 0 ? filtered[hi] : exact ?? (!canCreate && filtered.length === 1 ? filtered[0] : undefined);
		if (target) pick(target);
		else if (canCreate) createAndAssign();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="popover" role="dialog" aria-label="Edit labels" use:maybeFlip>
	<div class="assigned">
		{#each assignedLabels as label (label.id)}
			<LabelChip {label} onRemove={() => removeTaskLabel(taskId, label.id)} />
		{/each}
		{#if assignedLabels.length === 0}
			<span class="empty">No labels</span>
		{/if}
	</div>
	<input
		bind:this={inputEl}
		type="text"
		placeholder="Search a label…"
		bind:value={query}
		onkeydown={(e) => {
			if (e.key === 'Enter') onEnter(e);
			else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(filtered.length - 1, hi + 1); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(-1, hi - 1); }
		}}
	/>
	{#if canCreate}
		<div class="create">
			<input type="color" value="#{newColor}" oninput={(e) => (newColor = (e.target as HTMLInputElement).value.replace('#', ''))} aria-label="Colour" />
			<button class="create-btn" onclick={createAndAssign}>Create “{trimmed}”</button>
		</div>
	{/if}
	<div class="list">
		{#each filtered as label, i (label.id)}
			<button class="option" class:active={assignedIds.has(label.id)} class:hi={i === hi} onclick={() => { toggle(label); }}>
				<span class="dot" style="background: #{label.hex_color}"></span>
				{label.title}
				{#if assignedIds.has(label.id)}<span class="check">✓</span>{/if}
			</button>
		{/each}
		{#if filtered.length === 0}
			<div class="empty">No matching labels</div>
		{/if}
	</div>
	<button class="exit" onclick={onClose}>Exit</button>
</div>

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
	.assigned {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
		min-height: 20px;
	}
	input {
		width: 100%;
		margin-bottom: 6px;
	}
	.list {
		max-height: 220px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--radius);
		font-size: var(--fs-sm);
		text-align: left;
	}
	.option:hover {
		background: var(--bg-hover);
	}
	.option.hi {
		background: var(--bg-hover);
	}
	.option.active {
		color: var(--text);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.check {
		margin-left: auto;
		color: var(--accent);
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-xs);
		padding: 4px;
	}
	.create {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}
	.create input[type='color'] {
		width: 28px;
		height: 28px;
		padding: 2px;
		flex-shrink: 0;
	}
	.create-btn {
		flex: 1;
		text-align: left;
		font-size: var(--fs-sm);
		padding: 6px 8px;
		border-radius: var(--radius);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.create-btn:hover {
		background: var(--bg-hover);
	}
	.exit {
		width: 100%;
		margin-top: 8px;
		padding: 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-hover, transparent);
		color: var(--text);
		cursor: pointer;
	}
</style>
