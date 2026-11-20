<script lang="ts">
	// Opened via right-click on a saved filter in the right-hand panel —
	// lets you rename it, tweak its query, or delete it. Filters had no
	// edit/delete UI at all before this.
	import Modal from './Modal.svelte';
	import { updateFilter, deleteFilter } from '../actions/filters';
	import type { VikunjaFilter } from '../types';

	let { filter, onClose }: { filter: VikunjaFilter; onClose: () => void } = $props();

	let title = $state(filter.title);
	let filterString = $state(filter.filters.filter);

	// No Save button: whatever is set when the window closes is what counts.
	let deleted = false;
	async function close() {
		if (!deleted && title.trim() && filterString.trim() && (title.trim() !== filter.title || filterString.trim() !== filter.filters.filter)) {
			await updateFilter(filter.id, title.trim(), filterString.trim());
		}
		onClose();
	}

	async function remove() {
		if (confirm(`Delete the filter "${filter.title}"?`)) {
			deleted = true;
			await deleteFilter(filter.id);
			onClose();
		}
	}
</script>

<Modal title="Edit filter" onClose={close}>
	<input type="text" placeholder="Filter name" bind:value={title} />
	<div>
		<div class="label">Query (Vikunja syntax)</div>
		<textarea rows="3" bind:value={filterString}></textarea>
	</div>
	<div class="actions">
		<button class="btn" onclick={remove}>Delete filter</button>
	</div>
</Modal>

<style>
	.label {
		font-size: var(--fs-xs);
		color: var(--text-dim);
		margin-bottom: 4px;
	}
	textarea {
		width: 100%;
		resize: vertical;
		font-family: monospace;
		font-size: var(--fs-xs);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
</style>
