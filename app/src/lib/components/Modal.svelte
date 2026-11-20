<script lang="ts" module>
	// Open windows, last on top: Esc closes only the top one (10 Nov 2026: the Error report opened
	// from the Help centre closed both).
	const stack: symbol[] = [];
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { backCloses } from '../stores/overlays.svelte';
	import { portal } from '../actions/portal';
	let {
		title,
		onClose,
		wide = false,
		hideTitle = false,
		tall = false,
		children
	}: { title: string; onClose: () => void; wide?: boolean; hideTitle?: boolean; tall?: boolean; children: import('svelte').Snippet } = $props();

	// On open, put the cursor in the first field that can be typed in.
	function focusFirst(node: HTMLElement) {
		const t = setTimeout(() => {
			if (node.contains(document.activeElement) && document.activeElement !== node) return;
			const field = node.querySelector<HTMLElement>(
				'input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=hidden]):not([type=file]):not([disabled]), textarea:not([disabled])'
			);
			field?.focus();
			if (field instanceof HTMLInputElement && field.type === 'text') field.select();
		}, 0);
		return { destroy: () => clearTimeout(t) };
	}

	const me = Symbol('modal');
	stack.push(me);
	onDestroy(() => {
		const i = stack.indexOf(me);
		if (i !== -1) stack.splice(i, 1);
	});
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="backdrop"
	data-modal-backdrop
	use:portal
	onclick={onClose}
	onkeydown={() => {}}
	role="button"
	tabindex="-1"
>
	<div use:backCloses={onClose} use:focusFirst class="modal" class:wide class:tall onclick={(e) => e.stopPropagation()} role="dialog" aria-label={title} tabindex="-1">
		<div class="header">
			<h2 class:sr={hideTitle}>{title}</h2>
			<button class="btn-icon" onclick={onClose} aria-label="Close">×</button>
		</div>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(17, 17, 19, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		padding-bottom: 10vh; /* centred, a little high */
		box-sizing: border-box;
		z-index: 100;
	}
	.modal {
		position: relative;
		background: var(--bg);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		width: 400px;
		max-width: calc(100vw - 32px);
		max-height: calc(90vh - 48px);
		display: flex;
		flex-direction: column;
	}
	.modal.tall {
		height: calc(90vh - 48px);
		max-height: 680px;
		width: 460px;
	}
	.modal.tall .body {
		flex: 1;
		min-height: 0;
	}
	.modal.wide {
		width: 600px;
	}
	.header:has(.sr) {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 0;
		z-index: 1;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 0;
	}
	h2 {
		font-size: var(--fs-lg);
		font-weight: 600;
		margin: 0;
	}
	.body {
		padding: 16px 20px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
