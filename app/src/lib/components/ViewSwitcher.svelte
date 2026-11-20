<script lang="ts">
	// Top bar: All / Pro / Perso, the three written side by side (14 Nov 2026; before, a "View"
	// dropdown). The Inbox is a page in the menu since 13 Nov 2026.
	import { areaFilter, type Area } from '../stores/areaFilter.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const options: { value: Area; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'Pro', label: 'Pro' },
		{ value: 'Perso', label: 'Perso' }
	];

	function pick(v: Area) {
		areaFilter.set(v);
		// The view is shown on the home page: switching always goes back there.
		if (page.url.pathname !== '/') goto('/');
	}
</script>

<div class="views" role="radiogroup" aria-label="What the home page and the menu show">
	{#each options as o (o.value)}
		<button class="v" class:active={o.value === areaFilter.area} role="radio" aria-checked={o.value === areaFilter.area} onclick={() => pick(o.value)}>{o.label}</button>
	{/each}
</div>

<style>
	.views {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: var(--control-h);
		padding: 2px;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}
	.v {
		height: 100%;
		padding: 0 9px;
		border-radius: calc(var(--radius) - 2px);
		font-size: var(--fs-sm);
		font-weight: 500;
		color: var(--text-faint);
	}
	.v:hover {
		color: var(--text);
	}
	.v.active {
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}
	@media (max-width: 640px) {
		.v {
			padding: 0 7px;
		}
	}
</style>
