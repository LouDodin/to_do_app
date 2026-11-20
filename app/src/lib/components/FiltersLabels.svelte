<script lang="ts">
	// Filters and labels in the menu (10 Nov 2026; they had a panel of their own on the right).
	import { menuFold } from '../stores/menuFold.svelte';
	import { labelHref, parseLabelIds } from '../utils/labelFilter';
	import { page } from '$app/state';
	import { db } from '../db/schema';
	import { isContextLabel } from '../utils/context';
	import { liveState } from '../db/live.svelte';
	import { sortLabels } from '../utils/labelSort';
	import { splitSystemLabels } from '../utils/systemLabels';
	import { settings } from '../stores/settings.svelte';
	import LabelChip from './LabelChip.svelte';
	import Icon from './Icon.svelte';
	import { goto } from '$app/navigation';
	import NewFilterDialog from './NewFilterDialog.svelte';
	import NewLabelDialog from './NewLabelDialog.svelte';
	import EditFilterDialog from './EditFilterDialog.svelte';
	import { cleanFilterTitle, orderFilters, legacyOrder, moveInOrder } from '../utils/filterOrder';
	import { updateFilter } from '../actions/filters';
	import { findDuplicateFilters } from '../utils/dedupe';
	import { removeDuplicateFilters } from '../actions/maintenance';
	import { toastStore } from '../stores/toast.svelte';
	import { norm } from '../utils/dedupe';
	import type { VikunjaFilter } from '../types';

	const filters = liveState(() => db.filters.toArray(), []);
	const labels = liveState(() => db.labels.filter((l) => !isContextLabel(l)).toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	let labelQuery = $state('');
	const sortedLabels = $derived(
		sortLabels(labels.value, settings.colorOrder).filter((l) => !labelQuery.trim() || norm(l.title).includes(norm(labelQuery)))
	);
	// The labels the app and the automations use come first, on a line of their own (14 Nov 2026).
	const split = $derived(splitSystemLabels(sortedLabels));

	// Same-name filters: the numbered / working one stays, the useless copy goes.
	const dups = $derived(
		findDuplicateFilters(filters.value, {
			labelIds: new Set(labels.value.map((l) => l.id)),
			projectIds: new Set(projects.value.map((p) => p.id))
		})
	);
	const extraCount = $derived(dups.identical.reduce((n, g) => n + g.remove.length, 0));
	async function cleanDuplicates() {
		const names = dups.identical.flatMap((g) => g.remove.map((f) => `"${cleanFilterTitle(f.title)}"`));
		if (!confirm(`Delete ${extraCount} duplicate filter(s) (${names.join(', ')})? The working or numbered one of each name is kept.`)) return;
		for (const g of dups.identical) await removeDuplicateFilters(g);
		toastStore.success('Duplicate filters removed');
	}

	const ordered = $derived(orderFilters(filters.value, settings.filterOrder));

	// One-off tidy-up: "7. Groceries" becomes "Groceries" (also on the server)
	// unless another filter already has that name; the display strips numbers anyway.
	$effect(() => {
		if (filters.value.length === 0) return;
		// keep the old numbered order before the numbers disappear
		if (settings.filterOrder.length === 0) settings.setFilterOrder(legacyOrder(filters.value).map((f) => f.id));
		const taken = new Set(filters.value.map((f) => f.title.trim().toLowerCase()));
		for (const f of filters.value) {
			const clean = cleanFilterTitle(f.title);
			if (clean === f.title.trim() || f.id <= 0) continue;
			if (taken.has(clean.toLowerCase())) continue;
			taken.add(clean.toLowerCase());
			updateFilter(f.id, clean, f.filters.filter);
		}
	});

	// Drag to reorder (pointer events, so it also works by touch).
	let listEl: HTMLElement | undefined = $state();
	let dragId = $state<number | null>(null);
	let overIdx = $state<number | null>(null);
	let justDragged = false;
	// The whole row can be grabbed: the drag only starts once the pointer has moved a few
	// pixels, so a plain click still opens the filter.
	let pending: { id: number; x: number; y: number } | null = null;
	function startDrag(e: PointerEvent, id: number) {
		if (e.button !== 0) return;
		pending = { id, x: e.clientX, y: e.clientY };
	}
	function moveDrag(e: PointerEvent) {
		if (pending && dragId === null && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) {
			dragId = pending.id;
			listEl?.setPointerCapture(e.pointerId);
		}
		if (dragId === null || !listEl) return;
		const rows = [...listEl.querySelectorAll<HTMLElement>('[data-fid]')];
		let idx = rows.findIndex((r) => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
		overIdx = idx === -1 ? rows.length - 1 : idx;
	}
	function endDrag() {
		pending = null;
		if (dragId !== null && overIdx !== null) {
			const ids = ordered.map((f) => f.id);
			const from = ids.indexOf(dragId);
			if (from !== -1 && from !== overIdx) {
				settings.setFilterOrder(moveInOrder(ids, from, overIdx));
				justDragged = true;
				setTimeout(() => (justDragged = false), 50);
			}
		}
		dragId = null;
		overIdx = null;
	}

	let showNewFilter = $state(false);
	let showNewLabel = $state(false);
	let editingFilter = $state<VikunjaFilter | null>(null);
	// The labels shown by the label page, if it is the page being shown (11 Nov 2026).
	const onLabelPage = $derived(page.url.pathname.startsWith('/label/'));
	const shownLabels = $derived(onLabelPage ? parseLabelIds(decodeURIComponent(page.url.pathname.slice(7))) : []);
</script>

<div class="panel">
	<section class="block">
		<header class="block-head">
			<button class="fold" onclick={() => menuFold.toggle('filters')} aria-expanded={menuFold.isOpen('filters')}><span class="caret">{menuFold.isOpen('filters') ? '▾' : '▸'}</span><h3>Filters</h3></button>
			<button class="plus" onclick={() => (showNewFilter = true)} aria-label="New filter" title="New filter">+</button>
		</header>
		{#if menuFold.isOpen('filters')}
		{#if extraCount > 0}
			<button class="notice" onclick={cleanDuplicates}>
				{extraCount} duplicate {extraCount === 1 ? 'filter' : 'filters'} · Clean up
			</button>
		{/if}
		<div bind:this={listEl} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} role="list">
			{#each ordered as filter, i (filter.id)}
				<a
					href="/filter/{filter.id}"
					draggable="false"
					onpointerdown={(e) => startDrag(e, filter.id)}
					class="row"
					data-fid={filter.id}
					class:active={page.url.pathname === `/filter/${filter.id}`}
					class:dragging={dragId === filter.id}
					class:drop-before={dragId !== null && overIdx === i && dragId !== filter.id}
					onclick={(e) => { if (justDragged) e.preventDefault(); }}
					oncontextmenu={(e) => {
						e.preventDefault();
						editingFilter = filter;
					}}
				>
					<span class="row-title">{cleanFilterTitle(filter.title)}</span>
					<span class="grip" role="button" tabindex="-1" aria-label="Drag to reorder" >⠿</span>
				</a>
			{/each}
			{#if filters.value.length === 0}<p class="empty">No filters yet.</p>{/if}
		</div>
		{/if}
	</section>

	<section class="block">
		<header class="block-head">
			<button class="fold" onclick={() => menuFold.toggle('labels')} aria-expanded={menuFold.isOpen('labels')}><span class="caret">{menuFold.isOpen('labels') ? '▾' : '▸'}</span><h3>Labels</h3></button>
			<button class="plus" onclick={() => (showNewLabel = true)} aria-label="New label" title="New label">+</button>
		</header>
		{#if menuFold.isOpen('labels')}
		<div class="finder">
			<span class="finder-icon"><Icon name="search" size={13} /></span>
			<input
				type="text"
				placeholder="Find a label"
				aria-label="Find a label"
				autocomplete="off"
				spellcheck="false"
				bind:value={labelQuery}
				onkeydown={(e) => {
					if (e.key === 'Escape') labelQuery = '';
					else if (e.key === 'Enter' && (split.system[0] ?? split.other[0])) goto(`/label/${(split.system[0] ?? split.other[0]).id}`);
				}}
			/>
			{#if labelQuery}
				<button class="finder-clear" onclick={() => (labelQuery = '')} aria-label="Clear search">×</button>
			{/if}
		</div>
		{#snippet chip(label: (typeof sortedLabels)[number])}
			<a
				href={labelHref(label.id, page.url.pathname, page.url.search)}
				class="chip-link"
				class:active={shownLabels.includes(label.id)}
				aria-pressed={shownLabels.includes(label.id)}
				title={onLabelPage ? (shownLabels.includes(label.id) ? 'Take it off the list' : 'Add it to the list') : undefined}
			>
				<LabelChip {label} />
			</a>
		{/snippet}
		{#if split.system.length}
			<div class="chips system" title="Used by the app and the automations">
				{#each split.system as label (label.id)}{@render chip(label)}{/each}
			</div>
		{/if}
		<div class="chips">
			{#each split.other as label (label.id)}{@render chip(label)}{/each}
			{#if sortedLabels.length === 0}<p class="empty">No label found.</p>{/if}
		</div>
		{/if}
	</section>
</div>

{#if showNewFilter}
	<NewFilterDialog onClose={() => (showNewFilter = false)} />
{/if}
{#if showNewLabel}
	<NewLabelDialog onClose={() => (showNewLabel = false)} />
{/if}
{#if editingFilter}
	<EditFilterDialog filter={editingFilter} onClose={() => (editingFilter = null)} />
{/if}

<style>
	.block {
		margin-top: 10px;
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px 4px 0;
	}
	.fold {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 26px;
		padding: 0 4px;
		border-radius: var(--radius);
	}
	.fold:hover {
		background: var(--bg-hover);
	}
	.caret {
		width: 10px;
		font-size: 9px;
		color: var(--text-faint);
	}
	h3 {
		margin: 0;
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-faint);
	}
	.plus {
		width: 22px;
		height: 22px;
		border-radius: var(--radius);
		font-size: 15px;
		line-height: 1;
		color: var(--text-dim);
	}
	.plus:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.notice {
		display: block;
		width: 100%;
		text-align: left;
		margin: 0 0 6px;
		padding: 5px 8px;
		font-size: var(--fs-xs);
		border-radius: var(--radius);
		background: var(--bg-hover);
		color: var(--text);
	}
	.notice:hover {
		text-decoration: underline;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		font-size: var(--fs-sm);
		height: 30px;
		padding: 0 8px;
		border-radius: var(--radius);
		color: var(--text-dim);
	}
	.row:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.row.active {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 500;
	}
	.row-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.grip {
		flex-shrink: 0;
		cursor: grab;
		touch-action: none;
		color: var(--text-faint);
		opacity: 0;
		padding: 0 2px;
		user-select: none;
	}
	.row:hover .grip,
	.row.dragging .grip {
		opacity: 1;
	}
	@media (hover: none) {
		.grip {
			opacity: 0.6;
		}
	}
	.row.dragging {
		opacity: 0.5;
	}
	.row.drop-before {
		box-shadow: 0 -2px 0 0 var(--text);
	}
	.finder {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 10px;
	}
	.finder input {
		width: 100%;
		height: 30px;
		padding: 0 26px 0 28px;
		font-size: var(--fs-sm);
		background: var(--bg-hover);
		border: 1px solid transparent;
		border-radius: 999px;
		color: var(--text);
		outline: none;
		transition: background 0.12s, border-color 0.12s;
	}
	.finder input::placeholder {
		color: var(--text-faint);
	}
	.finder input:focus {
		background: var(--bg);
		border-color: var(--border);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--text) 8%, transparent);
	}
	.finder-icon {
		position: absolute;
		left: 10px;
		display: flex;
		color: var(--text-faint);
		pointer-events: none;
	}
	.finder-clear {
		position: absolute;
		right: 5px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: var(--fs-md);
		line-height: 1;
		color: var(--text-faint);
	}
	.finder-clear:hover {
		background: var(--border);
		color: var(--text);
	}
	/* Labels flow side by side and wrap, instead of one per line. */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px 4px;
	}
	.chips.system {
		padding-bottom: 7px;
		margin-bottom: 7px;
		border-bottom: 1px solid var(--border);
	}
	.chip-link {
		display: inline-flex;
		max-width: 100%;
		border-radius: 999px;
		outline-offset: 1px;
	}
	.chip-link:hover {
		filter: brightness(0.95);
	}
	.chip-link.active {
		outline: 1.5px solid var(--text);
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-xs);
		padding: 4px 8px;
		margin: 0;
	}
</style>
