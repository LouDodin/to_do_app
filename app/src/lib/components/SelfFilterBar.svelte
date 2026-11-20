<script lang="ts">
	// The filter box at the top of the home page (25 Oct 2026). Empty, it is just one search box.
	// What you type finds tasks at once (title, notes, label names, project), and the labels that
	// match are proposed: Enter (or a click) turns one into a label chip. Every criterion is combined
	// with AND. A tap on a chip switches it between "with" and "without"; × removes it.
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { isContextLabel } from '../utils/context';
	import { isBinProject } from '../utils/bin';
	import { treeOrder } from '../utils/projectOrder';
	import { sortLabels } from '../utils/labelSort';
	import { settings } from '../stores/settings.svelte';
	import { clickOutside } from '../actions/clickOutside';
	import { selfFilter } from '../stores/selfFilter.svelte';
	import { isActive, type DueChoice } from '../utils/selfFilter';
	import Icon from './Icon.svelte';

	let { count }: { count: number } = $props();

	const f = $derived(selfFilter.value);
	const labels = liveState(() => db.labels.filter((l) => !isContextLabel(l)).toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	const labelById = $derived(new Map(labels.value.map((l) => [l.id, l])));
	const projectOptions = $derived(
		treeOrder(projects.value.filter((p) => p.id > 0 && !p.is_archived && !isBinProject(p)))
	);
	const chosen = $derived([
		...f.withLabels.map((id) => ({ id, without: false })),
		...f.withoutLabels.map((id) => ({ id, without: true }))
	].filter((c) => labelById.has(c.id)));

	// Labels come first (the main way to filter, often many at once): type, Enter (or click) adds the
	// label and the box stays ready for the next; Backspace in the empty box removes the last one.
	let open = $state(false);
	const query = $derived(f.text);
	let hi = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	// While typing, the exact name comes first, then names starting with it ("dad" before "dad-place").
	const rank = (title: string, q: string) => (title === q ? 0 : title.startsWith(q) ? 1 : 2);
	const choices = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = sortLabels(
			labels.value.filter(
				(l) => !f.withLabels.includes(l.id) && !f.withoutLabels.includes(l.id) && l.title.toLowerCase().includes(q)
			),
			settings.colorOrder
		);
		return q ? [...list].sort((a, b) => rank(a.title.toLowerCase(), q) - rank(b.title.toLowerCase(), q)) : list;
	});
	$effect(() => {
		void query;
		hi = 0;
	});

	function addLabel(id: number) {
		selfFilter.update({ withLabels: [...f.withLabels, id], text: '' });
		open = false;
		inputEl?.focus();
	}
	function toggleLabel(id: number, without: boolean) {
		if (without) selfFilter.update({ withoutLabels: f.withoutLabels.filter((x) => x !== id), withLabels: [...f.withLabels, id] });
		else selfFilter.update({ withLabels: f.withLabels.filter((x) => x !== id), withoutLabels: [...f.withoutLabels, id] });
	}
	function removeLabel(id: number) {
		selfFilter.update({ withLabels: f.withLabels.filter((x) => x !== id), withoutLabels: f.withoutLabels.filter((x) => x !== id) });
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (open && query.trim() && choices[hi]) addLabel(choices[hi].id);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			hi = Math.min(hi + 1, choices.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			hi = Math.max(hi - 1, 0);
		} else if (e.key === 'Backspace' && query === '' && chosen.length) {
			removeLabel(chosen[chosen.length - 1].id);
		} else if (e.key === 'Escape') {
			if (open) open = false;
			else if (isActive(f)) selfFilter.clear();
			else inputEl?.blur();
		} else open = true;
	}

	const dueChoices: [DueChoice, string][] = [
		['any', 'Any due date'],
		['overdue', 'Overdue'],
		['today', 'Due today'],
		['week', 'Due in the next 7 days'],
		['dated', 'Has a due date'],
		['none', 'No due date'],
		['range', 'Due between…']
	];
</script>

<div class="bar" role="search" aria-label="My filter">
	<div class="labels-row">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tagbox" class:focus={open} use:clickOutside={() => (open = false)} onclick={() => inputEl?.focus()}>
			<span class="lead" aria-hidden="true"><Icon name="search" size={15} /></span>
			{#each chosen as c (c.id)}
				{@const l = labelById.get(c.id)!}
				<span class="chip" class:without={c.without} style="--dot: #{l.hex_color}">
					<button class="toggle" onclick={(e) => { e.stopPropagation(); toggleLabel(c.id, c.without); }} title={c.without ? 'Without this label: tap to require it' : 'With this label: tap to exclude it'}>
						{#if c.without}<span class="not">not</span>{/if}<span class="dot"></span><span class="name">{l.title}</span>
					</button>
					<button class="remove" onclick={(e) => { e.stopPropagation(); removeLabel(c.id); }} aria-label="Remove {l.title}">×</button>
				</span>
			{/each}
			<input
				bind:this={inputEl}
				class="tag-input"
				type="text"
				placeholder={chosen.length ? 'Another label or words' : 'Filter: labels, words, project…'}
				aria-label="Filter tasks"
				autocomplete="off"
				spellcheck="false"
				value={query}
				oninput={(e) => {
					selfFilter.update({ text: (e.currentTarget as HTMLInputElement).value });
					open = true;
				}}
				onkeydown={onKey}
			/>
			{#if isActive(f)}
				<button class="clear-x" onclick={(e) => { e.stopPropagation(); selfFilter.clear(); open = false; }} aria-label="Clear the filter" title="Clear (Esc)">×</button>
			{/if}
			{#if open && (query.trim() || choices.length) && (query.trim() !== '' || chosen.length === 0)}
				<div class="menu" role="listbox">
					{#each choices.slice(0, query.trim() ? 8 : 60) as l, i (l.id)}
						<button
							class="item"
							class:hi={i === hi}
							role="option"
							aria-selected={i === hi}
							onmousedown={(e) => e.preventDefault()}
							onclick={(e) => { e.stopPropagation(); addLabel(l.id); }}
						><span class="dot" style="--dot: #{l.hex_color}"></span>{l.title}</button>
					{:else}
						<div class="dim empty">No label "{query.trim()}": the tasks below match the words</div>
					{/each}
				</div>
			{/if}
		</div>
		{#if f.withLabels.length > 1}
			<div class="mode" role="group" aria-label="How the labels combine">
				<button class:on={f.labelMode === 'all'} onclick={() => selfFilter.update({ labelMode: 'all' })} title="Tasks with every one of these labels">All of them</button>
				<button class:on={f.labelMode === 'any'} onclick={() => selfFilter.update({ labelMode: 'any' })} title="Tasks with at least one of these labels">Any of them</button>
			</div>
		{/if}
	</div>

	{#if isActive(f)}
	<div class="more">
		<select value={f.due} onchange={(e) => selfFilter.update({ due: (e.currentTarget as HTMLSelectElement).value as DueChoice })} aria-label="Due date">
			{#each dueChoices as [v, label] (v)}<option value={v}>{label}</option>{/each}
		</select>
		{#if f.due === 'range'}
			<span class="range">
				<input type="date" value={f.from} onchange={(e) => selfFilter.update({ from: (e.currentTarget as HTMLInputElement).value })} aria-label="From" />
				<span class="dim">to</span>
				<input type="date" value={f.to} onchange={(e) => selfFilter.update({ to: (e.currentTarget as HTMLInputElement).value })} aria-label="To" />
			</span>
		{/if}
		<select
			value={f.projectId === null ? '' : String(f.projectId)}
			onchange={(e) => {
				const v = (e.currentTarget as HTMLSelectElement).value;
				selfFilter.update({ projectId: v === '' ? null : Number(v) });
			}}
			aria-label="Project"
		>
			<option value="">Any project</option>
			{#each projectOptions as o (o.project.id)}
				<option value={String(o.project.id)}>{'  '.repeat(o.depth)}{o.project.title}</option>
			{/each}
		</select>
		<span class="count dim">{count} task{count === 1 ? '' : 's'}</span>
	</div>
	{/if}
</div>

<style>
	.bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 4px 0 10px;
	}
	.labels-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px;
	}
	.tagbox {
		position: relative;
		flex: 1 1 320px;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		padding: 5px 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--bg);
		cursor: text;
	}
	.tagbox.focus {
		border-color: var(--text);
	}
	.tag-input {
		flex: 1 1 120px;
		min-width: 100px;
		height: 26px;
		border: none;
		padding: 0 2px;
		background: transparent;
		font-size: var(--fs-sm);
	}
	.tag-input:focus {
		outline: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		height: 26px;
		border-radius: 13px;
		background: var(--bg-elevated);
		font-size: var(--fs-xs);
	}
	.chip button {
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		cursor: pointer;
		height: 100%;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.toggle {
		padding: 0 4px 0 10px;
	}
	.remove {
		padding: 0 9px 0 4px;
		color: var(--text-faint);
	}
	.chip.without {
		background: color-mix(in srgb, var(--danger) 10%, transparent);
	}
	.chip.without .name {
		text-decoration: line-through;
	}
	.not {
		font-weight: 600;
		color: var(--danger);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--dot);
		flex: none;
	}
	/* In the flow, under the chips (never covering the controls below it). */
	.menu {
		flex-basis: 100%;
		max-height: 220px;
		overflow: auto;
		border-top: 1px solid var(--border);
		padding-top: 4px;
		margin-top: 2px;
		cursor: default;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 0 4px;
		align-content: start;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border: 0;
		background: none;
		border-radius: var(--radius);
		text-align: left;
		font-size: var(--fs-sm);
		color: var(--text);
		cursor: pointer;
	}
	.item:hover,
	.item.hi {
		background: var(--bg-hover);
	}
	.mode {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		height: 30px;
		margin-top: 4px;
	}
	.mode button {
		padding: 0 10px;
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
	.mode button.on {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.more {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.more select {
		flex: 1 1 140px;
		min-width: 0;
		max-width: 240px;
	}
	.more select,
	.more input {
		height: 28px;
		font-size: var(--fs-xs);
		max-width: 100%;
	}
	.range {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.dim {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
	.empty {
		padding: 6px 8px;
		grid-column: 1 / -1;
	}
	.count {
		margin-left: auto;
		font-size: var(--fs-xs);
	}
	.clear-x {
		margin-left: auto;
		width: 26px;
		height: 26px;
		border-radius: 13px;
		color: var(--text-faint);
		font-size: 16px;
		line-height: 1;
	}
	.clear-x:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.lead {
		display: inline-flex;
		color: var(--text-faint);
		margin-left: 2px;
	}
</style>
