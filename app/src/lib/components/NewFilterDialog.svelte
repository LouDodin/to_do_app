<script lang="ts">
	import Modal from './Modal.svelte';
	import { createFilter } from '../actions/filters';

	let { onClose }: { onClose: () => void } = $props();

	let title = $state('');
	let filterString = $state('');

	async function submit() {
		if (!title.trim() || !filterString.trim()) return;
		await createFilter(title.trim(), filterString.trim());
		onClose();
	}
</script>

<Modal title="New filter" {onClose}>
	<input type="text" placeholder="Filter name" bind:value={title} />
	<div>
		<div class="label">Query (Vikunja syntax)</div>
		<textarea rows="3" placeholder="due_date &lt; now &amp;&amp; done = false" bind:value={filterString}></textarea>
	</div>
	<button class="btn btn-primary" onclick={submit}>Create</button>
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
</style>
