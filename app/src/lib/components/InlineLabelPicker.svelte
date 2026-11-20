<script lang="ts">
	import { openUpIfNoRoom } from '../actions/openUpIfNoRoom';
	// Like LabelPopover, but for contexts where there's no task yet to write
	// through the API (quick-add) — it just tracks a local list of selected
	// label ids and reports changes via onChange.
	import { db } from '../db/schema';
	import { isContextLabel } from '../utils/context';
	import { liveState } from '../db/live.svelte';
	import { sortLabels } from '../utils/labelSort';
	import { settings } from '../stores/settings.svelte';
	import { clickOutside } from '../actions/clickOutside';
	import { createLabel } from '../actions/labels';
	import LabelChip from './LabelChip.svelte';
	import type { VikunjaLabel } from '../types';

	let {
		selectedIds,
		onChange
	}: { selectedIds: number[]; onChange: (ids: number[]) => void } = $props();

	let open = $state(false);
	let query = $state('');
	let hi = $state(-1);
	$effect(() => { query; hi = -1; });
	let inputEl: HTMLInputElement | undefined = $state();

	const allLabels = liveState(() => db.labels.filter((l) => !isContextLabel(l)).toArray(), []);
	const selected = $derived(allLabels.value.filter((l) => selectedIds.includes(l.id)));
	const filtered = $derived(
		sortLabels(
			allLabels.value.filter((l) => l.title.toLowerCase().includes(query.toLowerCase())),
			settings.colorOrder
		)
	);

	$effect(() => {
		if (open) inputEl?.focus();
	});

	let newColor = $state('5f5ff6');
	const trimmed = $derived(query.trim());
	const canCreate = $derived(
		trimmed.length > 0 && !allLabels.value.some((l) => l.title.toLowerCase() === trimmed.toLowerCase())
	);
	async function createAndSelect() {
		const id = await createLabel(trimmed, newColor);
		onChange([...selectedIds, id]);
		query = '';
	}

	function pick(label: VikunjaLabel) {
		if (!selectedIds.includes(label.id)) onChange([...selectedIds, label.id]);
		open = false;
		query = '';
	}
	function onEnter() {
		const exact = allLabels.value.find((l) => l.title.toLowerCase() === trimmed.toLowerCase());
		const target = hi >= 0 ? filtered[hi] : exact ?? (!canCreate && filtered.length === 1 ? filtered[0] : undefined);
		if (target) pick(target);
		else if (canCreate) createAndSelect();
	}

	function toggle(label: VikunjaLabel) {
		if (selectedIds.includes(label.id)) onChange(selectedIds.filter((id) => id !== label.id));
		else onChange([...selectedIds, label.id]);
	}
</script>

<div class="wrap" use:clickOutside={() => (open = false)}>
	<button type="button" class="trigger" onclick={() => (open = !open)}>
		{#each selected as label (label.id)}
			<LabelChip {label} />
		{/each}
		<span class="placeholder">{selected.length === 0 ? 'Labels' : '+'}</span>
	</button>
	{#if open}
		<div class="popover" use:openUpIfNoRoom>
			<input
				bind:this={inputEl}
				type="text"
				placeholder="Search or create…"
				bind:value={query}
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
					else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(filtered.length - 1, hi + 1); }
					else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(-1, hi - 1); }
				}}
			/>
			{#if canCreate}
				<div class="create">
					<input type="color" value="#{newColor}" oninput={(e) => (newColor = (e.target as HTMLInputElement).value.replace('#', ''))} aria-label="Colour" />
					<button type="button" class="create-btn" onclick={createAndSelect}>Create “{trimmed}”</button>
				</div>
			{/if}
			<div class="list">
				{#each filtered as label, i (label.id)}
					<button type="button" class="option" class:hi={i === hi} onclick={() => { toggle(label); }}>
						<span class="dot" style="background: #{label.hex_color}"></span>
						{label.title}
						{#if selectedIds.includes(label.id)}<span class="check">✓</span>{/if}
					</button>
				{/each}
			</div>
			<button type="button" class="close" onclick={() => (open = false)}>Close</button>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		height: var(--control-h);
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg);
		font-size: var(--fs-sm);
	}
	.trigger:hover {
		background: var(--bg-hover);
	}
	.placeholder {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
	.popover {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 50;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		padding: 10px;
		width: 240px;
	}
	input {
		width: 100%;
		margin-bottom: 6px;
	}
	.list {
		max-height: 200px;
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
	.option.hi { background: var(--bg-hover); }
	.close {
		margin-top: 6px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.create {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 4px 0;
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
</style>
