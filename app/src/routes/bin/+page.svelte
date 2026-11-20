<script lang="ts">
	import { db } from '../../lib/db/schema';
	import { liveState } from '../../lib/db/live.svelte';
	import { restoreFromBin, eraseFromBin } from '../../lib/actions/bin';
	import { daysLeftInBin, BIN_DAYS } from '../../lib/utils/bin';
	import { toastStore } from '../../lib/stores/toast.svelte';
	import { isAbandoned } from '../../lib/utils/context';

	const items = liveState(
		async () => (await db.bin.toArray()).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')),
		[]
	);

	function deletedOn(updated?: string): string {
		return updated ? new Date(updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
	}
	async function restore(id: number, title: string) {
		await restoreFromBin(id);
		toastStore.success(`"${title}" is back in the Inbox`);
	}
	async function erase(id: number) {
		if (confirm('Delete this task for good? This cannot be undone.')) await eraseFromBin(id);
	}
	async function empty() {
		if (!confirm(`Delete all ${items.value.length} tasks in the Bin for good? This cannot be undone.`)) return;
		for (const t of items.value) await eraseFromBin(t.id);
	}
</script>

<svelte:head>
	<title>Bin — Tasks</title>
</svelte:head>

<div class="page">
	<div class="head">
		<h1>Bin</h1>
		{#if items.value.length}<button class="btn" onclick={empty}>Empty the Bin</button>{/if}
	</div>
	<div class="list">
		{#each items.value as t (t.id)}
			<div class="row">
				<div class="text">
					<span class="title">{t.title}</span>
					<span class="meta">{isAbandoned(t) ? 'Abandoned' : 'Deleted'} {deletedOn(t.updated)} · {daysLeftInBin(t.updated)} days left{t.done && !isAbandoned(t) ? ' · was completed' : ''}</span>
				</div>
				<button class="btn" onclick={() => restore(t.id, t.title)}>Restore</button>
				<button class="btn quiet" onclick={() => erase(t.id)} aria-label="Delete for good">Delete</button>
			</div>
		{/each}
		{#if items.value.length === 0}
			<div class="empty">The Bin is empty.</div>
		{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	h1 {
		font-size: var(--fs-xl);
		letter-spacing: -0.01em;
		margin: 0 0 6px;
	}
	.intro {
		color: var(--text-dim);
		font-size: var(--fs-sm);
		margin: 0 0 24px;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--border);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: var(--fs-md, var(--fs-sm));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.quiet {
		color: var(--text-dim);
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		padding: 12px 0;
	}
</style>
