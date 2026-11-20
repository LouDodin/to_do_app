<script lang="ts">
	import { toastStore } from '../stores/toast.svelte';
</script>

<div class="toast-host">
	{#each toastStore.toasts as t (t.id)}
		<div class="toast {t.kind}">
			<span class="message">{t.message}</span>
			{#if t.action}
				<button
					class="action"
					onclick={() => {
						t.action!.onClick();
						toastStore.dismiss(t.id);
					}}
				>
					{t.action.label}
				</button>
			{/if}
			<button class="dismiss" onclick={() => toastStore.dismiss(t.id)} aria-label="Dismiss">×</button>
		</div>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 300;
		pointer-events: none;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--accent);
		color: var(--accent-contrast);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		padding: 8px 10px 8px 14px;
		font-size: var(--fs-sm);
		min-width: 220px;
		max-width: 420px;
		pointer-events: auto;
		animation: rise 0.15s ease-out;
	}
	.toast.error {
		background: var(--danger);
	}
	.message {
		flex: 1;
	}
	.action {
		color: var(--accent-contrast);
		text-decoration: underline;
		font-size: var(--fs-sm);
		font-weight: 600;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.dismiss {
		color: var(--accent-contrast);
		opacity: 0.6;
		font-size: var(--fs-md);
		flex-shrink: 0;
	}
	.dismiss:hover {
		opacity: 1;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
