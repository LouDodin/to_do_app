<script lang="ts">
	// Opened via right-click on any label chip anywhere in the app — lets
	// you rename the label and change its colour in place.
	import Modal from './Modal.svelte';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { updateLabel, deleteLabel } from '../actions/labels';
	import type { VikunjaLabel } from '../types';

	let { label, onClose }: { label: VikunjaLabel; onClose: () => void } = $props();

	const allLabels = liveState(() => db.labels.toArray(), []);
	const existingColors = $derived(
		[...new Set(allLabels.value.map((l) => l.hex_color.toLowerCase()))].filter(
			(c) => c !== label.hex_color.toLowerCase()
		)
	);

	let title = $state(label.title);
	let color = $state(label.hex_color);

	// No Save button: whatever is set when the window closes is what counts.
	let deleted = false;
	async function close() {
		if (!deleted && title.trim() && (title.trim() !== label.title || color !== label.hex_color)) {
			await updateLabel(label.id, { title: title.trim(), hex_color: color });
		}
		onClose();
	}

	async function remove() {
		if (confirm(`Delete the label "${label.title}"?`)) {
			deleted = true;
			await deleteLabel(label.id);
			onClose();
		}
	}
</script>

<Modal title="Edit label" onClose={close}>
	<input
		type="text"
		placeholder="Label name"
		bind:value={title}
		onkeydown={(e) => e.key === 'Enter' && close()}
	/>

	{#if existingColors.length > 0}
		<div>
			<div class="label">Existing colours</div>
			<div class="swatches">
				{#each existingColors as c (c)}
					<button
						type="button"
						class="swatch"
						class:active={color === c}
						style="background: #{c}"
						aria-label="#{c}"
						onclick={() => (color = c)}
					></button>
				{/each}
			</div>
		</div>
	{/if}

	<div>
		<div class="label">Or pick a colour</div>
		<div class="picker-row">
			<input
				type="color"
				value="#{color}"
				oninput={(e) => (color = (e.target as HTMLInputElement).value.slice(1))}
			/>
			<input
				type="text"
				class="hex"
				value={color}
				oninput={(e) => (color = (e.target as HTMLInputElement).value.replace('#', ''))}
			/>
		</div>
	</div>

	<div class="actions">
		<button class="btn" onclick={remove}>Delete label</button>
	</div>
</Modal>

<style>
	.label {
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-dim);
		margin-bottom: 6px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid transparent;
	}
	.swatch.active {
		border-color: var(--text);
	}
	.picker-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.hex {
		width: 90px;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
</style>
