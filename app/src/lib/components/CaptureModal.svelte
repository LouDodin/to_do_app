<script lang="ts">
	import { backCloses } from '../stores/overlays.svelte';
	// The "new task" window, opened by the N shortcut or the + button (and
	// by the OS-level shortcut in its own window): one text box, the task goes to the Inbox.
	import QuickAdd from './QuickAdd.svelte';

	let { onClose }: { onClose: () => void } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="backdrop" role="presentation" onclick={onClose}>
	<div use:backCloses={onClose} class="card" role="dialog" aria-label="New task" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
		<QuickAdd compact onDone={onClose} />
		<p class="tip">Enter: add · ⌘/Ctrl+Enter: add another · Esc: close</p>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(17, 17, 19, 0.35);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14vh;
		z-index: 100;
	}
	@media (max-width: 760px) {
		.backdrop {
			padding-top: calc(10px + env(safe-area-inset-top, 0px));
		}
	}
	/* No keyboard on a touch screen: the key tips mean nothing there. */
	@media (hover: none) {
		.tip {
			display: none;
		}
	}
	.card {
		width: min(560px, calc(100vw - 24px));
		box-shadow: var(--shadow-pop);
		border-radius: var(--radius-lg);
		background: var(--bg);
	}
	.tip {
		margin: 0;
		padding: 8px 14px 10px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
</style>
