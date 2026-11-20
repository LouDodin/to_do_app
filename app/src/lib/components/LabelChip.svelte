<script lang="ts">
	import EditLabelDialog from './EditLabelDialog.svelte';
	import type { VikunjaLabel } from '../types';

	let { label, onRemove }: { label: VikunjaLabel; onRemove?: () => void } = $props();

	// Right-click anywhere a label appears opens its editor (rename /
	// recolour), self-contained so every caller gets this for free.
	let showEdit = $state(false);
</script>

<span
	class="chip"
	style="--dot: #{label.hex_color}"
	role="group"
	aria-label="{label.title} label, right-click to edit"
	oncontextmenu={(e) => {
		e.preventDefault();
		showEdit = true;
	}}
>
	<span class="dot"></span>
	{label.title}
	{#if onRemove}
		<button class="remove" onclick={onRemove} aria-label="Remove {label.title}">×</button>
	{/if}
</span>

{#if showEdit}
	<EditLabelDialog {label} onClose={() => (showEdit = false)} />
{/if}

<style>
	/* Tinted with the label's own colour (12%) instead of a grey box with a
	   border, so a row of labels reads as colour first, text second. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: color-mix(in srgb, var(--dot) 13%, var(--bg));
		border-radius: 999px;
		padding: 2px 9px 2px 7px;
		font-size: var(--fs-xs);
		line-height: 1.4;
		color: var(--text);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--dot);
		flex-shrink: 0;
	}
	.remove {
		color: var(--text-dim);
		font-size: var(--fs-sm);
		line-height: 1;
		padding: 0 0 0 2px;
	}
	.remove:hover {
		color: var(--danger);
	}
</style>
