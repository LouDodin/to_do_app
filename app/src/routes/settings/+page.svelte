<script lang="ts">
	// The Help centre as a page (an old bookmark, or a link): same four tabs as the ? window.
	// /settings?tab=updates opens a given tab.
	import HelpTabs from '../../lib/components/HelpTabs.svelte';
	import { helpStore, HELP_TABS, type HelpTab } from '../../lib/stores/help.svelte';
	import { page } from '$app/state';

	$effect(() => {
		const t = page.url.searchParams.get('tab') as HelpTab | null;
		helpStore.tab = t && HELP_TABS.some((x) => x.id === t) ? t : 'settings';
	});
</script>

<svelte:head>
	<title>Help centre — Tasks</title>
</svelte:head>

<div class="settings page">
	<h1>Help centre</h1>
	<div class="wrap"><HelpTabs /></div>
</div>

<style>
	h1 {
		font-size: var(--fs-xl);
		letter-spacing: -0.01em;
		margin: 0 0 24px;
	}
	.wrap {
		padding-top: 16px;
		max-width: 640px;
	}
	.wrap :global(.tabs) {
		margin: -16px 0 16px;
		padding: 0;
		top: 0;
	}
</style>
