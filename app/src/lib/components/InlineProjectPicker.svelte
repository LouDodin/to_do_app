<script lang="ts">
	import ProjectPicker from './ProjectPicker.svelte';
	import { portal } from '../actions/portal';
	import type { VikunjaProject } from '../types';

	let {
		selected,
		onChange,
		placeholder = 'No project',
		excludeIds = [],
		clearable = true
	}: {
		selected: VikunjaProject | null;
		onChange: (p: VikunjaProject | null) => void;
		placeholder?: string;
		excludeIds?: number[];
		// Show a × to unset the choice (not wanted when a value is mandatory,
		// e.g. a task's project — there you just click to pick another).
		clearable?: boolean;
	} = $props();

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let popEl: HTMLDivElement | undefined = $state();
	let pos = $state({ top: 0 as number | null, bottom: null as number | null, left: 0, maxH: 400 });

	// The list is drawn above everything, outside the window that holds the field, so it can
	// run on below that window instead of being cut off by it.
	function toggle() {
		open = !open;
		if (open && triggerEl) {
			const r = triggerEl.getBoundingClientRect();
			// Not enough room below (5 Nov 2026): it opens upwards when there is more room above.
			const below = window.innerHeight - r.bottom - 24;
			const above = r.top - 24;
			pos =
				below < 300 && above > below
					? { top: null, bottom: window.innerHeight - r.top + 4, left: r.left, maxH: Math.max(160, above) }
					: { top: r.bottom + 4, bottom: null, left: r.left, maxH: Math.max(160, below) };
		}
	}
	$effect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			const t = e.target as Node;
			if (popEl?.contains(t) || triggerEl?.contains(t)) return;
			open = false;
		};
		window.addEventListener('pointerdown', away, true);
		return () => window.removeEventListener('pointerdown', away, true);
	});
</script>

<div class="wrap">
	<button type="button" class="trigger" bind:this={triggerEl} onclick={toggle}>
		{selected ? selected.title : placeholder}
		{#if selected && clearable}
			<span
				class="clear"
				role="button"
				tabindex="0"
				onclick={(e) => {
					e.stopPropagation();
					onChange(null);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.stopPropagation();
						onChange(null);
					}
				}}>×</span
			>
		{/if}
	</button>
	{#if open}
		<div
			class="float"
			data-modal-backdrop
			use:portal
			bind:this={popEl}
			style="{pos.top !== null ? `top: ${pos.top}px;` : `bottom: ${pos.bottom}px;`} left: {pos.left}px; --list-max: {pos.maxH - 70}px"
		>
			<ProjectPicker
				onSelect={(p) => onChange(p)}
				onClose={() => (open = false)}
				{excludeIds}
			/>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.float {
		position: fixed;
		z-index: 300;
		width: 260px;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		height: var(--control-h);
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg);
		font-size: var(--fs-sm);
	}
	.trigger:hover {
		background: var(--bg-hover);
	}
	.clear {
		color: var(--text-faint);
	}
	.clear:hover {
		color: var(--danger);
	}
</style>
