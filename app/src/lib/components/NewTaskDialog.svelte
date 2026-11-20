<script lang="ts">
	// A new task, set up in one small window (13 Nov 2026; redone the same day: the first one
	// overflowed its box on the Mac). Opened by + next to a project's or a section's name, and next
	// to a day on Upcoming. The title, notes, then one row of small buttons: project, section, start,
	// due, labels. Enter adds it and closes; Ctrl/⌘+Enter adds it and keeps the window open; Esc or
	// a click outside closes. Put in a project, it is validated at once (it skips the Inbox).
	// 20 Nov 2026 (Lou #578): also the window of the + button (inboxFirst: the Inbox unless another
	// project is chosen), with a reminder, a repeat and 🛒 (a shopping item) besides.
	import { onMount } from 'svelte';
	import { portal } from '../actions/portal';
	import { backCloses } from '../stores/overlays.svelte';
	const LABEL_HEX: Record<string, string> = { today: '000000', week: '1e88e5', p1: 'd92c22', 'next-action': '5f5ff6' };
	const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
	import LabelChip from './LabelChip.svelte';
	import Icon from './Icon.svelte';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { createTask, ensureHiddenLabel } from '../actions/tasks';
	import { isContextLabel, isInboxProject, VALIDATED_LABEL } from '../utils/context';
	import { sortLabels } from '../utils/labelSort';
	import { settings } from '../stores/settings.svelte';
	import { toastStore } from '../stores/toast.svelte';
	import { isBinProject } from '../utils/bin';
	import { repeatFields, type RepeatKind } from '../utils/recurrence';
	import { addShoppingItem } from '../actions/shopping';

	let {
		projectId = undefined,
		sectionId = null,
		startDay = undefined,
		labelTitles = [],
		inboxFirst = false,
		onClose
	}: { projectId?: number; sectionId?: number | null; startDay?: Date; labelTitles?: string[]; inboxFirst?: boolean; onClose: () => void } = $props();

	const LAST = 'new_task_last_project';
	const projects = liveState(() => db.projects.filter((p) => !p.is_archived && !isBinProject(p)).toArray(), []);
	const labels = liveState(() => db.labels.filter((l) => !isContextLabel(l)).toArray(), []);

	let title = $state('');
	let notes = $state('');
	// svelte-ignore state_referenced_locally
	let project = $state<number | null>(projectId ?? (inboxFirst ? null : readLast()));
	// svelte-ignore state_referenced_locally
	let section = $state<number | null>(sectionId);
	// svelte-ignore state_referenced_locally
	let start = $state<string | null>(startDay ? at(startDay, 9) : null);
	let due = $state<string | null>(null);
	let remind = $state<string | null>(null);
	let repeat = $state<RepeatKind>('none');
	let shopping = $state(false);
	let labelIds = $state<number[]>([]);
	// Labels given from the start (19 Nov 2026: + next to a block of the home page, such as
	// "today" for Today); created if missing.
	onMount(async () => {
		if (!labelTitles.length) return;
		const { ensureLabel } = await import('../actions/labels');
		const ids = await Promise.all(labelTitles.map((t) => ensureLabel(t, LABEL_HEX[t] ?? '888888')));
		labelIds = [...new Set([...labelIds, ...ids])];
	});
	let open = $state<'start' | 'due' | 'remind' | 'labels' | null>(null);
	let query = $state('');
	let busy = $state(false);
	let titleEl: HTMLInputElement | undefined = $state();

	function readLast(): number | null {
		try {
			const v = Number(localStorage.getItem(LAST));
			return Number.isFinite(v) && v > 0 ? v : null;
		} catch {
			return null;
		}
	}
	function at(d: Date, h: number): string {
		const x = new Date(d);
		x.setHours(h, h === 23 ? 59 : 0, 0, 0);
		return x.toISOString();
	}
	const today = () => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	};
	const plus = (n: number) => {
		const d = today();
		d.setDate(d.getDate() + n);
		return d;
	};
	const short = (iso: string | null) => {
		if (!iso) return '';
		const d = new Date(iso);
		const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today().getTime()) / 86_400_000);
		if (diff === 0) return 'Today';
		if (diff === 1) return 'Tomorrow';
		return d.toLocaleDateString('en-GB', diff > 0 && diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
	};
	const dayValue = (iso: string | null) => {
		if (!iso) return '';
		const d = new Date(iso);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	// Projects in tree order, sub-projects indented.
	const tree = $derived.by(() => {
		const kids = new Map<number, typeof projects.value>();
		for (const p of projects.value) kids.set(p.parent_project_id ?? 0, [...(kids.get(p.parent_project_id ?? 0) ?? []), p]);
		const out: { id: number; label: string }[] = [];
		const walk = (id: number, depth: number) => {
			for (const p of (kids.get(id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))) {
				out.push({ id: p.id, label: `${'  '.repeat(depth)}${p.title}` });
				walk(p.id, depth + 1);
			}
		};
		walk(0, 0);
		return out;
	});
	const inbox = $derived(projects.value.find((p) => isInboxProject(p.id, new Map(projects.value.map((x) => [x.id, x])))));
	$effect(() => {
		if (project === null && inbox) project = inbox.id;
	});
	const sections = liveState(async () => {
		const p = project;
		return p ? db.sections.where('project_id').equals(p).sortBy('position') : [];
	}, []);
	const chosen = $derived(labelIds.map((id) => labels.value.find((l) => l.id === id)).filter((l) => !!l));
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const rest = labels.value.filter((l) => !labelIds.includes(l.id) && (!q || l.title.toLowerCase().includes(q)));
		// All of them (19 Nov 2026: only the first 8 were listed, so the list could not be slid
		// through to the others).
		return sortLabels(rest, settings.colorOrder);
	});

	onMount(() => {
		const t = setTimeout(() => titleEl?.focus(), 30);
		return () => clearTimeout(t);
	});

	async function add(keepOpen: boolean) {
		const t = title.trim();
		if (!t || busy || (!project && !shopping)) return;
		busy = true;
		try {
			if (shopping) {
				await addShoppingItem(t, notes.trim() || undefined);
				toastStore.success('Added to the shopping list');
				if (!keepOpen) return onClose();
				title = '';
				notes = '';
				titleEl?.focus();
				return;
			}
			if (!project) return;
			// A repeat needs a due date to start from: tomorrow 9:00 when none was given.
			let dueAt = due;
			if (repeat !== 'none' && !dueAt) {
				const d = plus(1);
				d.setHours(9, 0, 0, 0);
				dueAt = d.toISOString();
			}
			const byId = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
			const validated = isInboxProject(project, byId) ? [] : [await ensureHiddenLabel(VALIDATED_LABEL, '4caf50')];
			await createTask({
				title: t,
				project_id: project,
				description: notes.trim() || undefined,
				start_date: start ?? new Date().toISOString(),
				due_date: dueAt,
				label_ids: [...validated, ...labelIds],
				...(repeat !== 'none' ? repeatFields(repeat) : {}),
				...(remind ? { reminders: [{ reminder: remind }] } : {}),
				section_id: sections.value.some((s) => s.id === section) ? section : null
			});
			// From a Home block (19 Nov 2026): a task left in the Inbox only shows in that block once
			// sorted, so say where it went.
			if (labelTitles.length && !validated.length) toastStore.success('In the Inbox: it shows here once sorted');
			if (projectId === undefined && !inboxFirst) {
				try {
					localStorage.setItem(LAST, String(project));
				} catch {
					/* not remembered */
				}
			}
			toastStore.success(validated.length ? 'Task added' : 'Added to the Inbox');
			if (!keepOpen) return onClose();
			title = '';
			notes = '';
			labelIds = [];
			remind = null;
			repeat = 'none';
			titleEl?.focus();
		} catch (e) {
			toastStore.error('Could not add the task: ' + (e as Error).message);
		} finally {
			busy = false;
		}
	}
	function keys(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (open) open = null;
			else onClose();
		} else if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !(e.target as HTMLElement).closest('.pop')) {
			e.preventDefault();
			void add(e.metaKey || e.ctrlKey);
		}
	}
	function localValue(iso: string) {
		const d = new Date(iso);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	}
	function setDate(which: 'start' | 'due', d: Date | null) {
		const v = d ? at(d, which === 'due' ? 23 : 9) : null;
		if (which === 'start') start = v;
		else due = v;
		open = null;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<!-- A click outside: first it closes an open menu (dates, labels), then the window, without adding. -->
<div class="veil" use:portal onclick={() => (open ? (open = null) : onClose())}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="card" role="dialog" aria-label="New task" tabindex="-1" use:backCloses={onClose} onclick={(e) => { e.stopPropagation(); if (open && !(e.target as HTMLElement).closest('.wrap')) open = null; }} onkeydown={keys}>
		<input class="t" type="text" placeholder="New task" aria-label="Task" bind:this={titleEl} bind:value={title} autocomplete="off" />
		<textarea class="n" placeholder="Notes" aria-label="Notes" rows="1" bind:value={notes}></textarea>


		<div class="bar">
			<label class="pill sel" title="Project">
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h4l1.5 1.5H14v6.5H2z" /></svg>
				<select aria-label="Project" bind:value={project}>
					{#each tree as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
				</select>
			</label>
			{#if sections.value.length}
				<label class="pill sel" title="Section">
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
					<select aria-label="Section" bind:value={section}>
						<option value={null}>No section</option>
						{#each sections.value as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
					</select>
				</label>
			{/if}
			{#each ['start', 'due'] as const as which (which)}
				{@const v = which === 'start' ? start : due}
				<span class="wrap">
					<button class="pill" class:set={!!v} class:due={which === 'due' && !!v} onclick={() => (open = open === which ? null : which)} aria-label={which === 'start' ? 'Start date' : 'Due date'} aria-expanded={open === which}>
						{#if which === 'start'}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11" /></svg>{:else}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5h8l-2 3 2 3H4" /></svg>{/if}
						{v ? short(v) : which === 'start' ? 'Start' : 'Due'}
					</button>
					{#if open === which}
						<div class="pop">
							<button onclick={() => setDate(which, plus(0))}>Today</button>
							<button onclick={() => setDate(which, plus(1))}>Tomorrow</button>
							<button onclick={() => setDate(which, plus(7))}>In a week</button>
							<input type="date" aria-label="{which === 'start' ? 'Start' : 'Due'}: another day" value={dayValue(v)} onchange={(e) => { const s = (e.target as HTMLInputElement).value; if (s) setDate(which, new Date(`${s}T00:00`)); }} />
							{#if v}<button class="clear" onclick={() => setDate(which, null)}>None</button>{/if}
						</div>
					{/if}
				</span>
			{/each}
			<span class="wrap">
				<button class="pill" class:set={!!remind} onclick={() => (open = open === 'remind' ? null : 'remind')} aria-label="Reminder" aria-expanded={open === 'remind'}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3zM6.5 14h3" /></svg>
					{remind ? `${short(remind)} ${new Date(remind).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Remind'}
				</button>
				{#if open === 'remind'}
					<div class="pop">
						<input type="datetime-local" aria-label="Remind me at" value={remind ? localValue(remind) : ''} onchange={(e) => { const v = (e.target as HTMLInputElement).value; remind = v ? new Date(v).toISOString() : null; }} />
						{#if remind}<button class="clear" onclick={() => { remind = null; open = null; }}>None</button>{/if}
					</div>
				{/if}
			</span>
			<label class="pill sel" class:set={repeat !== 'none'} title="Repeat">
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.5A4.5 4.5 0 0 1 11.5 4.5L13 6M13 2.5V6H9.5M13 9.5A4.5 4.5 0 0 1 4.5 11.5L3 10M3 13.5V10h3.5" /></svg>
				<select aria-label="Repeat" bind:value={repeat}>
					<option value="none">Repeat</option>
					<option value="week">Every week</option>
					<option value="month">Every month</option>
					<option value="year">Every year</option>
				</select>
			</label>
			<span class="wrap">
				<button class="pill" class:set={labelIds.length > 0} onclick={() => { open = open === 'labels' ? null : 'labels'; query = ''; }} aria-label="Labels" aria-expanded={open === 'labels'}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h5.5l5.5 5.5-5.5 5.5-5.5-5.5z" /><circle cx="5.5" cy="5.5" r="1" /></svg>
					Labels
				</button>
				{#if open === 'labels'}
					<div class="pop labels-pop">
						<!-- 19 Nov 2026: no keyboard popping up on touch screens (it hid most of the list, which then
						     could not be slid through); a tap on the box still brings it. -->
						<!-- svelte-ignore a11y_autofocus -->
						<input type="text" placeholder="Find a label" aria-label="Find a label" bind:value={query} autofocus={!touch} autocomplete="off" onkeydown={(e) => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); labelIds = [...labelIds, matches[0].id]; query = ''; } }} />
						{#each matches as l (l.id)}
							<button class="opt" onclick={() => { labelIds = [...labelIds, l.id]; query = ''; }}><LabelChip label={l} /></button>
						{:else}
							<span class="none">—</span>
						{/each}
					</div>
				{/if}
			</span>
			<!-- The labels given, each with ×, in the row itself (13 Nov 2026: a number was not enough). -->
			{#each chosen as l (l.id)}<LabelChip label={l} onRemove={() => (labelIds = labelIds.filter((x) => x !== l.id))} />{/each}
			{#if inboxFirst}<button class="pill cart" class:set={shopping} aria-pressed={shopping} aria-label="Shopping" title="A shopping item: straight onto the shopping list" onclick={() => (shopping = !shopping)}><Icon name="cart" size={14} /></button>{/if}
			<button class="add" disabled={!title.trim() || busy} onclick={() => add(false)} aria-label="Add the task">Add</button>
		</div>
		<p class="tip">Enter: add · ⌘/Ctrl+Enter: add another · Esc: close</p>
	</div>
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.32);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 14vh 12px 0;
		overflow-y: auto;
	}
	.card {
		width: min(560px, 100%);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-pop);
		padding: 14px 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		outline: none;
	}
	.t,
	.n {
		width: 100%;
		border: none;
		background: transparent;
		padding: 4px 6px;
		outline: none;
		box-shadow: none;
		height: auto;
	}
	.t {
		font-size: var(--fs-lg);
		font-weight: 600;
	}
	.n {
		font-size: var(--fs-sm);
		color: var(--text-dim);
		resize: none;
		field-sizing: content;
		min-height: 1.6em;
		max-height: 30vh;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding-top: 8px;
		margin-top: 4px;
		border-top: 1px solid var(--border);
	}
	.wrap {
		position: relative;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 28px;
		max-width: 220px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		font-size: var(--fs-xs);
		color: var(--text-dim);
		background: var(--bg);
		white-space: nowrap;
	}
	.pill:hover {
		background: var(--bg-hover);
	}
	.pill.set {
		color: var(--text);
		border-color: var(--text-faint);
	}
	.pill.due {
		color: var(--danger);
	}
	.pill svg {
		width: 13px;
		height: 13px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linejoin: round;
	}
	.sel select {
		border: none;
		background: transparent;
		font: inherit;
		color: inherit;
		padding: 0;
		height: auto;
		min-width: 0;
		max-width: 170px;
		text-overflow: ellipsis;
		outline: none;
		box-shadow: none;
		cursor: pointer;
	}
	.tip {
		margin: 6px 6px 0;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	/* No keyboard on a touch screen: the key tips mean nothing there. */
	@media (hover: none) {
		.tip {
			display: none;
		}
	}
	.add {
		margin-left: auto;
		height: 30px;
		padding: 0 16px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.add:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.pop {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 5;
		min-width: 170px;
		display: flex;
		flex-direction: column;
		padding: 4px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-sm);
	}
	.pop > button {
		text-align: left;
		padding: 6px 8px;
		border-radius: 6px;
	}
	.pop > button:hover {
		background: var(--bg-hover);
	}
	.pop input {
		margin: 4px;
		height: 30px;
	}
	.pop .clear {
		color: var(--text-faint);
	}
	.labels-pop {
		min-width: 220px;
		max-height: 300px;
		overflow-y: auto;
		overscroll-behavior: contain;
		touch-action: pan-y;
	}
	.labels-pop > * {
		flex: none;
	}
	/* Phones (15 Nov 2026): the lists open under the whole bar, never past the screen's edge. */
	@media (max-width: 560px) {
		.bar {
			position: relative;
		}
		.wrap {
			position: static;
		}
		.pop {
			left: 0;
			right: 0;
			min-width: 0;
		}
		/* The list fits on the screen above the keyboard, and slides (19 Nov 2026). */
		.labels-pop {
			max-height: min(300px, 42vh);
		}
	}
	.none {
		padding: 6px 8px;
		color: var(--text-faint);
	}
	@media (max-width: 760px) {
		.veil {
			padding-top: calc(10px + env(safe-area-inset-top, 0px));
		}
		.t,
		.n,
		.pop input,
		.sel select {
			font-size: 16px;
		}
	}
</style>
