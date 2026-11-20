<script lang="ts">
	// The bar for several selected tasks (5 Nov 2026; redesigned 11 Nov 2026). On the left, how
	// many are selected, × to clear and "Select all"; then one button per kind of change: Complete,
	// Move (project, section), Labels, Due, then Pending, Shopping, Inbox directly (11 Nov 2026: no
	// "More" menu; a white bar), Abandon (19 Nov 2026) and Bin. Every action ends the selection (11 Nov 2026, Lou: "unselect
	// them as soon as one thing has been done").
	// One Undo (Ctrl/⌘+Z) takes back each change.
	import { multiSelect, clearMulti, pageSections, selectAll, selectableIds } from '../stores/multiSelect.svelte';
	import { moveTaskToProject, completeTask, deleteTask, abandonTask, moveTaskToSection, validateTask, addTaskLabel, removeTaskLabel, updateTask, setTaskPending } from '../actions/tasks';
	import { setShopping, isShopping } from '../actions/shopping';
	import { recorded } from '../stores/history.svelte';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { isInboxProject, isContextLabel, isTaskPending } from '../utils/context';
	import { endOfDayIso } from '../utils/dates';
	import { sortLabels } from '../utils/labelSort';
	import { settings } from '../stores/settings.svelte';
	import { toastStore } from '../stores/toast.svelte';
	import { viewport } from '../stores/viewport.svelte';
	import { page } from '$app/state';
	import ProjectPicker from './ProjectPicker.svelte';
	import LabelChip from './LabelChip.svelte';
	import Icon from './Icon.svelte';
	import { getInboxProject } from '../db/queries';
	import type { VikunjaTask } from '../types';

	type Menu = 'move' | 'labels' | 'date' | null;
	let menu = $state<Menu>(null);
	let labelQuery = $state('');
	let pickedDate = $state('');
	const n = $derived(multiSelect.ids.length);
	const total = $derived(n ? selectableIds().length : 0);
	const onProjectPage = $derived(page.url.pathname === `/project/${pageSections.projectId}`);

	// The selected tasks as they are now (labels, flags), to show what all or some of them have.
	const chosen = liveState<VikunjaTask[]>(async () => {
		const ids = [...multiSelect.ids];
		return ids.length ? ((await db.tasks.bulkGet(ids)).filter(Boolean) as VikunjaTask[]) : [];
	}, []);
	const labels = liveState(() => db.labels.toArray(), []);
	const labelChoices = $derived.by(() => {
		const q = labelQuery.trim().toLowerCase();
		const all = sortLabels(labels.value.filter((l) => !isContextLabel(l) && l.title.toLowerCase() !== 'shopping'), settings.colorOrder);
		return (q ? all.filter((l) => l.title.toLowerCase().includes(q)) : all).slice(0, 60);
	});
	function labelState(id: number): 'all' | 'some' | 'none' {
		const k = chosen.value.filter((t) => t.labels?.some((l) => l.id === id)).length;
		return k === 0 ? 'none' : k === chosen.value.length ? 'all' : 'some';
	}
	const allPending = $derived(chosen.value.length > 0 && chosen.value.every((t) => isTaskPending(t)));
	const allShopping = $derived(chosen.value.length > 0 && chosen.value.every((t) => isShopping(t)));

	const plural = (k: number) => `${k} task${k > 1 ? 's' : ''}`;
	async function each(label: string, fn: (id: number) => Promise<void>) {
		const ids = [...multiSelect.ids];
		await recorded(label, ids, async () => {
			for (const id of ids) await fn(id);
		});
		return ids.length;
	}
	function open(m: Exclude<Menu, null>) {
		menu = menu === m ? null : m;
		labelQuery = '';
	}
	async function moveTo(projectId: number, title: string) {
		menu = null;
		const k = await each(`Move ${plural(n)}`, (id) => moveTaskToProject(id, projectId));
		toastStore.success(`${plural(k)} moved to ${title} (Ctrl/⌘+Z to undo)`);
		clearMulti();
	}
	async function backToInbox() {
		const inbox = await getInboxProject();
		if (inbox) await moveTo(inbox.id, 'the Inbox');
	}
	async function toSection(sectionId: number | null, title: string) {
		menu = null;
		const k = await each(`Move ${plural(n)} to a section`, (id) => moveTaskToSection(id, sectionId));
		toastStore.success(`${plural(k)} moved to ${title}`);
		clearMulti();
	}
	async function completeAll() {
		menu = null;
		const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
		const tasks = chosen.value;
		const undefinedOnes = tasks.filter((t) => isInboxProject(t.project_id, projects));
		if (undefinedOnes.length) return toastStore.error(`${plural(undefinedOnes.length)} still in the Inbox: give them a project first.`);
		const k = await each(`Complete ${plural(n)}`, async (id) => {
			const t = tasks.find((x) => x.id === id);
			if (t && !t.done) {
				await validateTask(id);
				await completeTask(id, true);
			}
		});
		toastStore.success(`${plural(k)} completed (Ctrl/⌘+Z to undo)`);
		clearMulti();
	}
	// 19 Nov 2026 (Lou #558): abandon them all, as Abandon on one task (closed without being done,
	// into the Bin).
	async function abandonAll() {
		menu = null;
		const tasks = chosen.value;
		const k = await each(`Abandon ${plural(n)}`, async (id) => {
			const t = tasks.find((x) => x.id === id);
			if (t && !t.done) await abandonTask(id);
		});
		toastStore.success(`${plural(k)} abandoned: in the Bin (Ctrl/⌘+Z to undo)`);
		clearMulti();
	}
	async function binAll() {
		menu = null;
		const k = await each(`Move ${plural(n)} to the Bin`, (id) => deleteTask(id, { quiet: true }));
		toastStore.success(`${plural(k)} moved to the Bin (Ctrl/⌘+Z to undo)`);
		clearMulti();
	}
	async function toggleLabel(id: number, title: string) {
		const add = labelState(id) !== 'all';
		menu = null;
		const k = await each(`${add ? 'Add' : 'Remove'} the label ${title}`, (tid) => (add ? addTaskLabel(tid, id) : removeTaskLabel(tid, id)));
		toastStore.success(add ? `Label ${title} added to ${plural(k)}` : `Label ${title} taken off ${plural(k)}`);
		clearMulti();
	}
	async function setDue(iso: string | null, what: string) {
		menu = null;
		const k = await each(`Due date of ${plural(n)}`, (id) => updateTask(id, { due_date: iso }));
		toastStore.success(iso ? `${plural(k)} due ${what}` : `Due date removed from ${plural(k)}`);
		clearMulti();
	}
	async function pending(on: boolean) {
		menu = null;
		await each(on ? `Put ${plural(n)} on hold` : `Resume ${plural(n)}`, (id) => setTaskPending(id, on));
		toastStore.success(on ? `${plural(n)} on hold` : `${plural(n)} resumed`);
		clearMulti();
	}
	async function shopping(on: boolean) {
		menu = null;
		await each(on ? `Add ${plural(n)} to Shopping` : `Remove ${plural(n)} from Shopping`, (id) => setShopping(id, on));
		toastStore.success(on ? `${plural(n)} on the Shopping list` : `${plural(n)} off the Shopping list`);
		clearMulti();
	}

	// Leaving the page clears the selection. (Through a derived string: closing a window goes
	// back in the history to the same page, which must not clear it.)
	const path = $derived(page.url.pathname);
	$effect(() => {
		path;
		return () => clearMulti();
	});
	$effect(() => {
		if (!n) menu = null;
	});

	function keys(e: KeyboardEvent) {
		if (!n) return;
		const t = e.target as HTMLElement;
		const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
		if (e.key === 'Escape') {
			if (document.querySelector('[role=dialog][aria-modal=true]')) return;
			e.preventDefault();
			if (menu) menu = null;
			else clearMulti();
		} else if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			selectAll();
		}
	}
	// A click on an empty part of the page (not a task, not the bar) ends the selection.
	function outside(e: PointerEvent) {
		if (!n) return;
		const t = e.target as HTMLElement;
		if (t.closest('.row, .bulk, .bulk-pop, button, a, input, select, textarea, label, [role=dialog], .modal, .scrim, aside, header')) return;
		clearMulti();
	}
	function placeDate() {
		if (!pickedDate) return;
		const d = new Date(`${pickedDate}T18:00`);
		void setDue(d.toISOString(), d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
		pickedDate = '';
	}
</script>

<svelte:window onkeydown={keys} onpointerdown={outside} />

{#if n > 0}
	<div class="bulk" class:phone={viewport.phone} role="toolbar" aria-label="{n} tasks selected">
		<div class="sel">
			<button class="x" onclick={clearMulti} aria-label="Clear the selection" title="Clear the selection (Esc)"><Icon name="close" size={16} /></button>
			<span class="count">{n} selected</span>
			{#if total > n}
				<button class="all" onclick={selectAll} title="Select every task of this list (Ctrl/⌘+A)">Select all {total}</button>
			{/if}
		</div>
		<div class="acts">
			<button class="act" onclick={completeAll} title="Complete them"><Icon name="check" /><span>Complete</span></button>
			<button class="act" class:open={menu === 'move'} onclick={() => open('move')} aria-expanded={menu === 'move'}><Icon name="folder" /><span>Move</span></button>
			<button class="act" class:open={menu === 'labels'} onclick={() => open('labels')} aria-expanded={menu === 'labels'}><Icon name="tag" /><span>Labels</span></button>
			<button class="act" class:open={menu === 'date'} onclick={() => open('date')} aria-expanded={menu === 'date'}><Icon name="calendar" /><span>Due</span></button>
			<span class="sep" aria-hidden="true"></span>
			<button class="act" class:on={allPending} onclick={() => pending(!allPending)} aria-pressed={allPending} title={allPending ? 'Resume them (no longer on hold)' : 'Put them on hold'}><Icon name="pause" /><span>{allPending ? 'Resume' : 'Pending'}</span></button>
			<button class="act" class:on={allShopping} onclick={() => shopping(!allShopping)} aria-pressed={allShopping} title={allShopping ? 'Take them off the Shopping list' : 'Put them on the Shopping list'}><Icon name="cart" /><span>Shopping</span></button>
			<button class="act" onclick={backToInbox} title="Send them back to the Inbox"><Icon name="inbox" /><span>Inbox</span></button>
			<span class="sep" aria-hidden="true"></span>
			<button class="act" onclick={abandonAll} title="Close them without doing them (into the Bin)"><Icon name="abandon" /><span>Abandon</span></button>
			<button class="act danger" onclick={binAll} title="Move them to the Bin (Ctrl/⌘+Z to undo)"><Icon name="trash" /><span>Bin</span></button>
		</div>

		{#if menu}
			<div class="bulk-pop" role="dialog" aria-label={menu === 'move' ? 'Move to' : menu === 'labels' ? 'Labels' : 'Due date'}>
				{#if menu === 'move'}
					<div class="picker"><ProjectPicker onSelect={(p) => moveTo(p.id, p.title)} onNone={backToInbox} onClose={() => (menu = null)} /></div>
					{#if onProjectPage && pageSections.list.length}
						<div class="group">Section of this project</div>
						<button class="item" onclick={() => toSection(null, 'the top of the project')}>No section (top)</button>
						{#each pageSections.list as s (s.id)}
							<button class="item" onclick={() => toSection(s.id, s.title)}>{s.title}</button>
						{/each}
					{/if}
				{:else if menu === 'labels'}
					<!-- svelte-ignore a11y_autofocus -->
					<input class="find" placeholder="Find a label…" bind:value={labelQuery} autofocus={!viewport.phone} />
					<div class="list">
						{#each labelChoices as l (l.id)}
							{@const st = labelState(l.id)}
							<button class="item label-item" onclick={() => toggleLabel(l.id, l.title)} aria-pressed={st === 'all'}>
								<span class="tick" class:all={st === 'all'} class:some={st === 'some'}>{#if st === 'all'}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{:else if st === 'some'}–{/if}</span>
								<LabelChip label={l} />
							</button>
						{:else}
							<div class="hint">No label found.</div>
						{/each}
					</div>
				{:else if menu === 'date'}
					<button class="item" onclick={() => setDue(endOfDayIso(0), 'today')}>Today</button>
					<button class="item" onclick={() => setDue(endOfDayIso(1), 'tomorrow')}>Tomorrow</button>
					<button class="item" onclick={() => setDue(endOfDayIso(7), 'in a week')}>In a week</button>
					<label class="item pick-date">On <input type="date" bind:value={pickedDate} onchange={placeDate} /></label>
					<button class="item dim" onclick={() => setDue(null, '')}>No due date</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* A white floating bar (11 Nov 2026), lifted by a soft shadow above the page. */
	.bulk {
		position: fixed;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		z-index: 200;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px;
		background: var(--bg);
		color: var(--text);
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 16px;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.14);
		font-size: var(--fs-sm);
		max-width: calc(100vw - 24px);
	}
	.sel {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 8px;
		margin-right: 2px;
		border-right: 1px solid var(--border);
		white-space: nowrap;
	}
	.x {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 10px;
		color: var(--text-faint);
	}
	.x:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.count {
		font-weight: 600;
		padding: 0 4px;
	}
	.all {
		color: var(--text-dim);
		font-size: var(--fs-xs);
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--bg-hover);
	}
	.all:hover {
		color: var(--text);
		background: var(--bg-elevated);
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.sep {
		width: 1px;
		height: 20px;
		background: var(--border);
		margin: 0 3px;
	}
	.act {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 10px;
		border-radius: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.act:hover,
	.act.open {
		background: var(--bg-hover);
		color: var(--text);
	}
	.act.on {
		color: var(--text);
		font-weight: 600;
	}
	.act.danger:hover {
		background: color-mix(in srgb, var(--danger) 12%, var(--bg));
		color: var(--danger);
	}
	/* The menus open above the bar, in the page's own colours */
	.bulk-pop {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: min(320px, calc(100vw - 24px));
		max-height: min(420px, 60vh);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 6px;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow-pop);
	}
	.picker :global(.popover) {
		position: static;
		box-shadow: none;
		border: none;
		width: 100%;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.item:hover {
		background: var(--bg-hover);
	}
	.item.dim {
		color: var(--text-dim);
	}
	.group {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		padding: 8px 10px 2px;
		border-top: 1px solid var(--border);
		margin-top: 4px;
	}
	.find {
		margin: 2px 2px 6px;
	}
	.hint {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		padding: 0 8px 6px;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.tick {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1.5px solid var(--border-strong);
		display: grid;
		place-items: center;
		font-size: 11px;
		line-height: 0;
		padding: 0;
		box-sizing: border-box;
		flex-shrink: 0;
	}
	.tick :global(svg) {
		display: block;
		margin: auto;
	}
	.tick.all {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.tick.some {
		color: var(--text-dim);
	}
	.pick-date input {
		flex: 1;
	}
	/* Phone: the bar spans the bottom; icons above short words */
	.bulk.phone {
		left: 8px;
		right: 8px;
		bottom: calc(10px + env(safe-area-inset-bottom));
		transform: none;
		max-width: none;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
	}
	.bulk.phone .sep {
		display: none;
	}
	.bulk.phone .sel {
		border-right: none;
		border-bottom: 1px solid var(--border);
		padding: 0 0 4px;
		margin: 0;
	}
	/* Two rows of five on the phone (19 Nov 2026: with Abandon, nine words ran into each other). */
	.bulk.phone .acts {
		justify-content: flex-start;
		flex-wrap: wrap;
		gap: 2px 0;
	}
	.bulk.phone .act {
		flex-direction: column;
		gap: 3px;
		height: auto;
		padding: 6px 0;
		flex: 0 0 20%;
		min-width: 0;
		font-size: 11px;
		white-space: nowrap;
	}
	.bulk.phone .bulk-pop {
		left: 0;
		transform: none;
		width: 100%;
	}
	@media (max-width: 1060px) and (min-width: 761px) {
		.act span {
			display: none;
		}
	}
</style>
