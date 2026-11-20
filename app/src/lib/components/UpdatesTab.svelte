<script lang="ts">
	// Help centre > Updates (10 Nov 2026): every update of the app, newest first, and a search box
	// that keeps the updates (and their lines) mentioning every word typed. Case and accents are
	// ignored; what matches is highlighted.
	import { NEWS, searchNews, highlight, lastSeen } from '../news';
	import { news } from '../news.svelte';
	import { onMount } from 'svelte';

	let query = $state('');
	// What was new when the tab was opened stays marked "New" while it is open.
	const seenBefore = lastSeen();
	const isNew = (id: string) => !seenBefore || id > seenBefore;
	onMount(() => news.seen());

	const results = $derived(searchNews(query));
	const lines = $derived(results.reduce((n, r) => n + r.items.length, 0));
</script>

<div class="updates">
	<div class="search">
		<input
			class="input"
			type="search"
			placeholder="Search the updates (e.g. shopping, undo, phone)"
			aria-label="Search the updates"
			autocomplete="off"
			spellcheck="false"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === 'Escape' && query) {
					e.stopPropagation();
					query = '';
				}
			}}
		/>
		<span class="count" aria-live="polite">
			{#if query.trim()}
				{results.length ? `${lines} change${lines > 1 ? 's' : ''} in ${results.length} update${results.length > 1 ? 's' : ''}` : 'No update mentions that'}
			{:else}
				{NEWS.length} updates since {NEWS[NEWS.length - 1].date}
			{/if}
		</span>
	</div>

	{#each results as n (n.id)}
		<article class="entry">
			<h3>
				<span class="date">{n.date}</span>
				<span class="title">{#each highlight(n.title, query) as part}{#if part.hit}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}</span>
				{#if !seenBefore ? n.id === NEWS[0].id : isNew(n.id)}<span class="new">New</span>{/if}
			</h3>
			<ul>
				{#each n.items as it}
					<li>{#each highlight(it, query) as part}{#if part.hit}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}</li>
				{/each}
			</ul>
		</article>
	{/each}
</div>

<style>
	.updates {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.search {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.search .input {
		width: 100%;
	}
	.count {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.entry h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		margin: 0 0 6px;
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.date {
		color: var(--text-faint);
		font-weight: 500;
		white-space: nowrap;
	}
	.new {
		font-size: var(--fs-2xs);
		font-weight: 600;
		color: #fff;
		background: var(--accent);
		border-radius: 999px;
		padding: 1px 7px;
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
		font-size: var(--fs-sm);
		color: var(--text-dim);
	}
	li {
		margin-bottom: 5px;
		line-height: 1.45;
	}
	mark {
		background: color-mix(in srgb, #ffd152 55%, transparent);
		color: var(--text);
		border-radius: 2px;
		padding: 0 1px;
	}
</style>
