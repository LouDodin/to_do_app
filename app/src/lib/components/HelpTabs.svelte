<script lang="ts">
	// The Help centre's content (10 Nov 2026): four tabs, used by the ? window and by the /settings page.
	import { helpStore, HELP_TABS, type HelpTab } from '../stores/help.svelte';
	import { problems } from '../stores/health.svelte';
	import { news } from '../news.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import UpdatesTab from './UpdatesTab.svelte';

	const issues = $derived(problems());
	function dot(t: HelpTab): string {
		if (t === 'status' && issues.length) return issues.some((c) => c.status === 'fail') ? 'fail' : 'warn';
		if (t === 'updates' && news.unseen > 0) return 'news';
		return '';
	}
	function keys(e: KeyboardEvent) {
		const i = HELP_TABS.findIndex((t) => t.id === helpStore.tab);
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			const next = HELP_TABS[(i + (e.key === 'ArrowRight' ? 1 : HELP_TABS.length - 1)) % HELP_TABS.length];
			helpStore.tab = next.id;
			(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
		}
	}
</script>

<div class="tabs" role="tablist" aria-label="Help centre" tabindex="-1" onkeydown={keys}>
	{#each HELP_TABS as t (t.id)}
		<button
			role="tab"
			class="tab"
			data-tab={t.id}
			aria-selected={helpStore.tab === t.id}
			tabindex={helpStore.tab === t.id ? 0 : -1}
			onclick={() => (helpStore.tab = t.id)}
		>
			{t.label}{#if dot(t.id)}<span class="dot {dot(t.id)}"></span>{/if}
		</button>
	{/each}
</div>

<div class="panel" role="tabpanel" aria-label={HELP_TABS.find((t) => t.id === helpStore.tab)?.label}>
	{#if helpStore.tab === 'updates'}
		<UpdatesTab />
	{:else}
		{#key helpStore.tab}<SettingsContent tab={helpStore.tab} />{/key}
	{/if}
</div>

<style>
	.tabs {
		position: sticky;
		top: -16px;
		z-index: 2;
		display: flex;
		gap: 2px;
		margin: -16px -20px 4px;
		padding: 12px 20px 0;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}
	.tab {
		position: relative;
		padding: 8px 12px;
		font-size: var(--fs-sm);
		font-weight: 500;
		color: var(--text-dim);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.tab:hover {
		color: var(--text);
	}
	.tab[aria-selected='true'] {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
	.dot.fail {
		background: var(--danger);
	}
	.dot.warn {
		background: #f59e0b;
	}
	@media (max-width: 420px) {
		.tab {
			padding: 8px 9px;
		}
	}
</style>
