<script lang="ts">
	import Modal from './Modal.svelte';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { createLabel } from '../actions/labels';

	let { onClose }: { onClose: () => void } = $props();

	const allLabels = liveState(() => db.labels.toArray(), []);
	const existingColors = $derived([...new Set(allLabels.value.map((l) => l.hex_color.toLowerCase()))]);

	let title = $state('');
	let color = $state('5f5ff6');

	async function submit() {
		if (!title.trim()) return;
		await createLabel(title.trim(), color);
		onClose();
	}
</script>

<Modal title="New label" {onClose}>
	<input
		type="text"
		placeholder="Label name"
		bind:value={title}
		onkeydown={(e) => e.key === 'Enter' && submit()}
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
			<input type="color" value="#{color}" oninput={(e) => (color = (e.target as HTMLInputElement).value.slice(1))} />
			<input
				type="text"
				class="hex"
				value={color}
				oninput={(e) => (color = (e.target as HTMLInputElement).value.replace('#', ''))}
			/>
		</div>
	</div>

	<button class="btn btn-primary" onclick={submit}>Create</button>
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
</style>
