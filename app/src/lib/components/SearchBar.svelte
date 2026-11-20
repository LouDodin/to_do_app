<script lang="ts">
	import Icon from './Icon.svelte';
	// The global search described in the spec ("Navigation commune à toutes
	// les pages"): reaches a project, filter, label or task from anywhere.
	// Opens with Cmd/Ctrl+K, or the button in the shell header.
	import { goto } from '$app/navigation';
	import { db } from '../db/schema';
	import { loadRecent, saveRecent, type RecentResult } from '../utils/recentSearches';
	import { cleanFilterTitle } from '../utils/filterOrder';

	let open = $state(false);
	let query = $state('');
	let results = $state<{ kind: string; id: number; label: string; project?: string }[]>([]);
	let activeIndex = $state(0);
	let recent = $state<(RecentResult & { project?: string })[]>([]);
	let inputEl: HTMLInputElement | undefined = $state();

	// A task's project, shown on the right of its row. Inbox/none -> nothing.
	async function projectName(projectId: number | undefined): Promise<string | undefined> {
		if (!projectId) return undefined;
		const p = await db.projects.get(projectId);
		return p && !(p.title.toLowerCase() === 'inbox' && !p.parent_project_id) ? p.title : undefined;
	}

	async function runSearch(q: string) {
		if (!q.trim()) {
			results = [];
			return;
		}
		const lower = q.toLowerCase();
		const [projects, filters, labels, tasks] = await Promise.all([
			db.projects.filter((p) => p.title.toLowerCase().includes(lower) && !(p.title.toLowerCase() === 'inbox' && !p.parent_project_id)).limit(6).toArray(),
			db.filters.filter((f) => f.title.toLowerCase().includes(lower)).limit(6).toArray(),
			db.labels.filter((l) => !l.title.toLowerCase().startsWith('ctx:') && l.title.toLowerCase().includes(lower)).limit(6).toArray(),
			db.tasks.filter((t) => t.title.toLowerCase().includes(lower)).limit(8).toArray()
		]);
		results = [
			...projects.map((p) => ({ kind: 'Project', id: p.id, label: p.title })),
			...filters.map((f) => ({ kind: 'Filter', id: f.id, label: cleanFilterTitle(f.title) })),
			...labels.map((l) => ({ kind: 'Label', id: l.id, label: l.title })),
			...(await Promise.all(tasks.map(async (t) => ({ kind: 'Task', id: t.id, label: t.title, project: await projectName(t.project_id) }))))
		];
		activeIndex = 0;
	}

	$effect(() => {
		runSearch(query);
	});

	function openSearch() {
		open = true;
		recent = loadRecent();
		// drop anything that has been deleted since
		(async () => {
			const table: Record<string, any> = { Project: db.projects, Filter: db.filters, Label: db.labels, Task: db.tasks };
			const keep: (RecentResult & { project?: string })[] = [];
			for (const r of recent) {
				const row = table[r.kind] ? await table[r.kind].get(r.id) : undefined;
				if (!row) continue;
				keep.push(r.kind === 'Task' ? { ...r, label: row.title, project: await projectName(row.project_id) } : r);
			}
			recent = keep;
		})();
		query = '';
		results = [];
		queueMicrotask(() => inputEl?.focus());
	}

	function closeSearch() {
		open = false;
	}

	function go(result: { kind: string; id: number; label: string }) {
		saveRecent({ kind: result.kind, id: result.id, label: result.label });
		const path =
			result.kind === 'Project'
				? `/project/${result.id}`
				: result.kind === 'Filter'
					? `/filter/${result.id}`
					: result.kind === 'Label'
						? `/label/${result.id}`
						: `/task/${result.id}`;
		goto(path);
		closeSearch();
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open ? closeSearch() : openSearch();
		} else if (open && e.key === 'Escape') {
			closeSearch();
		} else if (open && e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, results.length - 1);
		} else if (open && e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (open && e.key === 'Enter' && results[activeIndex]) {
			e.preventDefault();
			go(results[activeIndex]);
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<button class="trigger btn" onclick={openSearch} aria-label="Search">
	<Icon name="search" size={14} /><span class="word">Search</span>
</button>

{#if open}
	<div
		class="backdrop"
		onclick={closeSearch}
		onkeydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
		role="button"
		tabindex="-1"
	>
		<div class="box" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Search" tabindex="-1">
			<input
				bind:this={inputEl}
				type="text"
				placeholder="Search a project, filter, label or task…"
				bind:value={query}
			/>
			<div class="results">
				{#if !query.trim() && recent.length}
					<div class="recent-title">Opened recently</div>
					{#each recent as r (r.kind + r.id)}
						<button class="result" onclick={() => go(r)}>
							<span class="kind">{r.kind}</span>
							<span class="rtitle">{r.label}</span>
							{#if r.project}<span class="proj">{r.project}</span>{/if}
						</button>
					{/each}
				{/if}
				{#each results as result, i (result.kind + result.id)}
					<button class="result" class:active={i === activeIndex} onclick={() => go(result)}>
						<span class="kind">{result.kind}</span>
						<span class="rtitle">{result.label}</span>
						{#if result.project}<span class="proj">{result.project}</span>{/if}
					</button>
				{/each}
				{#if query && results.length === 0}
					<div class="empty">No results</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Looks like a field but is a button: a soft grey bar, no border. */
	.trigger {
		width: 100%;
		justify-content: flex-start;
		background: var(--bg-elevated);
		color: var(--text-faint);
		font-weight: 400;
		gap: 8px;
	}
	/* Narrow phones (15 Nov 2026): only the magnifier when the box gets small. */
	@container (max-width: 96px) {
		.trigger {
			justify-content: center;
		}
		.word {
			display: none;
		}
	}
	.trigger:hover:not(:disabled) {
		background: var(--bg-hover);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(17, 17, 19, 0.35);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 12vh;
		z-index: 200;
	}
	.box {
		width: 520px;
		max-width: calc(100vw - 32px);
		background: var(--bg);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		overflow: hidden;
	}
	input {
		width: 100%;
		height: auto;
		border: none;
		border-radius: 0;
		border-bottom: 1px solid var(--border);
		padding: 16px 18px;
		font-size: var(--fs-lg);
	}
	input:focus {
		outline: none;
		border-color: var(--border);
	}
	.results {
		max-height: 340px;
		overflow-y: auto;
		padding: 6px;
	}
	.result {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		text-align: left;
		padding: 8px 10px;
		border-radius: var(--radius);
		font-size: var(--fs-sm);
	}
	.result.active,
	.result:hover {
		background: var(--bg-elevated);
	}
	.kind {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		background: var(--bg-elevated);
		border-radius: 999px;
		padding: 0 8px;
		flex-shrink: 0;
	}
	.rtitle {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.proj {
		margin-left: auto;
		flex-shrink: 0;
		max-width: 38%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.recent-title {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		padding: 4px 10px;
	}
	.empty {
		padding: 14px;
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
</style>
