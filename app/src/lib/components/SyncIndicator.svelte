<script lang="ts">
	import { syncStore } from '../stores/sync.svelte';

	const label = $derived(
		{
			synced: 'Up to date',
			syncing: 'Syncing…',
			pending: `${syncStore.pendingCount} change${syncStore.pendingCount > 1 ? 's' : ''} pending`,
			offline: 'Offline — changes will be sent once back online',
			error: syncStore.lastError ?? 'Sync error'
		}[syncStore.status]
	);
</script>

<div class="indicator" class:error={syncStore.status === 'error'} title={label}>
	<span class="dot {syncStore.status}"></span>
	<span class="text">{label}</span>
</div>

<style>
	.indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		padding: 4px 8px;
	}
	.indicator.error {
		color: var(--danger);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-faint);
	}
	.dot.synced {
		background: var(--ok);
	}
	.dot.syncing {
		background: var(--accent);
		animation: pulse 1s infinite;
	}
	.dot.pending {
		background: #ffd152;
	}
	.dot.offline {
		background: var(--text-faint);
	}
	.dot.error {
		background: var(--danger);
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 760px) {
		.text {
			display: none;
		}
		.indicator {
			padding: 4px;
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
</style>
