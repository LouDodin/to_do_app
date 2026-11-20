<script lang="ts">
	// After an update, a small card with what changed (10 Nov 2026). Not a blocking window: the
	// app stays usable around it. Shown once per device; Help centre > Updates has them all.
	import { unseenNews, type NewsEntry } from '../news';
	import { news } from '../news.svelte';
	import { helpStore } from '../stores/help.svelte';
	import { onMount } from 'svelte';

	let entries = $state<NewsEntry[]>([]);
	onMount(() => {
		// Automated browsers (the app's own tests) only get it when they ask for it.
		let forced = false;
		try {
			forced = localStorage.getItem('news_test') === '1';
		} catch {
			// no storage: default
		}
		if (navigator.webdriver && !forced) return;
		const t = setTimeout(() => (entries = unseenNews()), 2500);
		return () => clearTimeout(t);
	});
	function close() {
		news.seen();
		entries = [];
	}
	function all() {
		close();
		helpStore.show('updates');
	}
</script>

{#if entries.length}
	<div class="news" role="dialog" aria-label="What's new">
		<div class="head">
			<strong>What’s new</strong>
			<button class="x" onclick={close} aria-label="Close">×</button>
		</div>
		<div class="body">
			{#each entries as n (n.id)}
				<div class="entry">
					<div class="when">{n.date}: {n.title}</div>
					<ul>
						{#each n.items as it}<li>{it}</li>{/each}
					</ul>
				</div>
			{/each}
		</div>
		<div class="actions">
			<button class="btn btn-outline" onclick={all}>All updates</button>
			<button class="btn btn-primary" onclick={close}>Got it</button>
		</div>
	</div>
{/if}

<style>
	.news {
		position: fixed;
		left: 16px;
		bottom: 16px;
		z-index: 900;
		width: min(400px, calc(100vw - 32px));
		max-height: min(70vh, 520px);
		display: flex;
		flex-direction: column;
		background: var(--bg-elevated, var(--bg));
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
		padding: 12px 14px;
		font-size: var(--fs-sm);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}
	.x {
		font-size: 20px;
		line-height: 1;
		color: var(--text-faint);
		padding: 0 4px;
	}
	.body {
		overflow-y: auto;
	}
	.when {
		font-weight: 600;
		color: var(--text-dim);
		margin: 4px 0;
	}
	ul {
		margin: 0 0 8px;
		padding-left: 1.2em;
	}
	li {
		margin-bottom: 4px;
		line-height: 1.4;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}
</style>
