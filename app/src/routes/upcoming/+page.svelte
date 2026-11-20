<script lang="ts">
	// Upcoming (13 Nov 2026, idea from Things; redone the same day, "modern and plain").
	// At the top, a strip of the next 7 days (a dot under a day with something; a click jumps to
	// it). Then: Overdue and "To schedule" (the week's list with no day yet), if any; then every day
	// one by one, for two months at least and up to the last planned task (14 Nov 2026; before, the
	// days after the first week were grouped by week, then by month). A month's name starts each month.
	// A task is planned for a day by its start date (it reaches the home page that day); a task due
	// that day is shown under it too, flagged. Plan: the calendar button on a row, or drag a row
	// onto a day (computer). + next to a day or a block: a new task for that day. Data: utils/upcoming.ts.
	import { db } from '../../lib/db/schema';
	import { liveState } from '../../lib/db/live.svelte';
	import { upcoming, planFor, dayStart } from '../../lib/utils/upcoming';
	import { updateTask, completeTask } from '../../lib/actions/tasks';
	import { recorded } from '../../lib/stores/history.svelte';
	import { draggedIds } from '../../lib/stores/multiSelect.svelte';
	import { hasDate } from '../../lib/utils/dates';
	import NewTaskDialog from '../../lib/components/NewTaskDialog.svelte';
	import Icon from '../../lib/components/Icon.svelte';
	import type { VikunjaTask } from '../../lib/types';

	const tasks = liveState(() => db.tasks.toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	const projectName = $derived(new Map(projects.value.map((p) => [p.id, p.title])));
	// "Today" moves on at midnight.
	let now = $state(new Date());
	$effect(() => {
		const t = setTimeout(() => (now = new Date()), Math.max(1000, dayStart(now, 1).getTime() - Date.now() + 1000));
		return () => clearTimeout(t);
	});
	const u = $derived(upcoming(tasks.value, projects.value, now));

	type Item = { t: VikunjaTask; due: boolean; day: Date };
	const itemsOf = (i: number): Item[] => [
		...u.days[i].planned.map((t) => ({ t, due: false, day: u.days[i].date })),
		...u.days[i].due.map((t) => ({ t, due: true, day: u.days[i].date }))
	];
	const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
	const days = $derived(u.days.map((d, i) => ({ date: d.date, i, items: itemsOf(i) })));
	const week = $derived(days.slice(0, 7));

	const dayTitle = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmt(d, { weekday: 'long' }));
	const shortDay = (d: Date) => {
		const i = Math.round((dayStart(d).getTime() - dayStart(now).getTime()) / 86_400_000);
		return i === 0 ? 'today' : i === 1 ? 'tomorrow' : fmt(d, i > 0 && i < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
	};
	const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	async function planOn(ids: number[], day: Date) {
		await recorded(ids.length > 1 ? `Plan ${ids.length} tasks` : 'Plan', ids, async () => {
			for (const id of ids) {
				const t = await db.tasks.get(id);
				if (t) await updateTask(id, { start_date: planFor(t, day) });
			}
		});
	}

	let over = $state<string | null>(null);
	function dragOver(e: DragEvent, key: string) {
		if (!e.dataTransfer?.types.includes('application/x-task-id')) return;
		e.preventDefault();
		over = key;
	}
	function drop(e: DragEvent, day: Date) {
		const ids = draggedIds(e);
		over = null;
		if (!ids.length) return;
		e.preventDefault();
		void planOn(ids, day);
	}

	let newFor = $state<Date | null>(null);
	const jump = (i: number) => document.getElementById(`day-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	const plannedDay = (t: VikunjaTask) => (hasDate(t.start_date) && new Date(t.start_date!).getTime() >= dayStart(now).getTime() ? iso(new Date(t.start_date!)) : '');
</script>

<svelte:head>
	<title>Upcoming — Tasks</title>
</svelte:head>

{#snippet row(it: Item, showDay: boolean)}
	{@const t = it.t}
	<div class="item" draggable="true" role="listitem" ondragstart={(e) => e.dataTransfer?.setData('application/x-task-id', String(t.id))}>
		<button class="tick" onclick={() => completeTask(t.id, true)} aria-label="Complete {t.title}" title="Complete"></button>
		{#if showDay}<span class="when">{fmt(it.day, { weekday: 'short', day: 'numeric' })}</span>{/if}
		<a class="title" href="/task/{t.id}">{t.title}</a>
		<span class="meta">
			{#if it.due}<span class="flag">due</span>{:else if hasDate(t.due_date)}<span class="flag soft">due {shortDay(new Date(t.due_date!))}</span>{/if}
			<span class="proj">{projectName.get(t.project_id) ?? ''}</span>
		</span>
		<label class="plan" title="Plan it for a day">
			<Icon name="upcoming" size={14} />
			<input
				type="date"
				aria-label="Plan {t.title} for a day"
				min={iso(now)}
				value={plannedDay(t)}
				onclick={(e) => {
					try {
						(e.currentTarget as HTMLInputElement).showPicker?.();
					} catch {
						/* the browser opens it its own way */
					}
				}}
				onchange={(e) => {
					const v = (e.target as HTMLInputElement).value;
					if (v) void planOn([t.id], new Date(`${v}T00:00`));
				}}
			/>
		</label>
	</div>
{/snippet}

<div class="up">
	<header>
		<h1>Upcoming</h1>
		<div class="strip">
			{#each week as d (d.i)}
				<button class="sd" class:today={d.i === 0} class:has={d.items.length > 0} onclick={() => jump(d.i)} aria-label="{dayTitle(d.date, d.i)}: {d.items.length} tasks">
					<span class="wd">{fmt(d.date, { weekday: 'narrow' })}</span>
					<span class="dn">{d.date.getDate()}</span>
					<span class="dot"></span>
				</button>
			{/each}
		</div>
	</header>

	{#if u.overdue.length}
		<section class="block overdue">
			<h2 class="label late">Overdue</h2>
			<div role="list">{#each u.overdue as t (t.id)}{@render row({ t, due: true, day: new Date(t.due_date!) }, true)}{/each}</div>
		</section>
	{/if}
	{#if u.toPlan.length}
		<section class="block to-plan">
			<h2 class="label">To schedule <span class="hint">the week's list, no day yet</span></h2>
			<div role="list">{#each u.toPlan as t (t.id)}{@render row({ t, due: false, day: now }, false)}{/each}</div>
		</section>
	{/if}

	{#each days as d (d.i)}
		{#if d.i > 0 && d.date.getDate() === 1}<h2 class="month">{fmt(d.date, { month: 'long', year: d.date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}</h2>{/if}
		<section
			id="day-{d.i}"
			class="day"
			class:over={over === `d${d.i}`}
			class:empty={!d.items.length}
			aria-label={dayTitle(d.date, d.i)}
			ondragover={(e) => dragOver(e, `d${d.i}`)}
			ondragleave={() => over === `d${d.i}` && (over = null)}
			ondrop={(e) => drop(e, d.date)}
		>
			<div class="dh">
				<span class="big">{d.date.getDate()}</span>
				<span class="dname">{dayTitle(d.date, d.i)}</span>
				{#if d.i > 1 && d.i < 7 && d.date.getMonth() !== now.getMonth()}<span class="sub">{fmt(d.date, { month: 'short' })}</span>{/if}
				<button class="plus" onclick={() => (newFor = d.date)} aria-label="New task for {fmt(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}" title="New task for this day"><Icon name="plus" size={15} /></button>
			</div>
			{#if d.items.length}<div role="list">{#each d.items as it (`${it.t.id}${it.due ? 'd' : 'p'}`)}{@render row(it, false)}{/each}</div>{/if}
		</section>
	{/each}

</div>

{#if newFor}
	<NewTaskDialog startDay={newFor} onClose={() => (newFor = null)} />
{/if}

<style>
	.up {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 24px 96px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 24px;
	}
	h1 {
		font-size: var(--fs-xl);
		margin: 0;
		letter-spacing: -0.01em;
	}
	/* The week strip */
	.strip {
		display: flex;
		gap: 2px;
	}
	.sd {
		width: 38px;
		padding: 6px 0 5px;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		color: var(--text-dim);
	}
	.sd:hover {
		background: var(--bg-hover);
	}
	.wd {
		font-size: 10px;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}
	.dn {
		font-size: var(--fs-md);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
	}
	.sd.has .dot {
		background: var(--text-dim);
	}
	.sd.today {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.sd.today .wd {
		color: inherit;
		opacity: 0.7;
	}
	.sd.today.has .dot {
		background: var(--accent-contrast);
	}
	/* Blocks */
	.block {
		margin-bottom: 26px;
	}
	.label {
		font-size: var(--fs-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		margin: 0 0 4px;
	}
	.label.late {
		color: var(--danger);
	}
	.hint {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		margin-left: 6px;
	}
	.day {
		margin-top: 22px;
		border-radius: 12px;
		scroll-margin-top: 70px;
		transition: background 0.12s;
	}
	.day.over {
		background: var(--bg-elevated);
		outline: 1px dashed var(--border-strong);
		outline-offset: 4px;
	}
	.dh {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--border);
	}
	.big {
		font-family: var(--font-dots, inherit);
		font-size: 28px;
		font-weight: 700;
		line-height: 1;
		min-width: 36px;
		font-variant-numeric: tabular-nums;
	}
	.dname {
		font-size: var(--fs-md);
		font-weight: 600;
	}
	.sub {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.day.empty {
		margin-top: 10px;
	}
	.day.empty .dh {
		border-bottom-color: transparent;
		padding-bottom: 0;
	}
	.day.empty .big,
	.day.empty .dname {
		color: var(--text-faint);
	}
	.day.empty .big {
		font-size: 20px;
	}
	.day.empty .dname {
		font-size: var(--fs-sm);
		font-weight: 500;
	}
	.month {
		margin: 34px 0 4px;
		font-size: var(--fs-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
	}
	.plus {
		margin-left: auto;
		align-self: center;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text-faint);
		opacity: 0;
		transition: opacity 0.12s;
	}
	.day:hover .plus,
	.plus:focus-visible {
		opacity: 1;
	}
	.plus:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	/* A task */
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 4px 2px;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}
	.item:last-child {
		border-bottom: none;
	}
	.tick {
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid var(--text-faint);
		transition:
			border-color 0.12s,
			background 0.12s;
	}
	.tick:hover {
		border-color: var(--text);
		background: color-mix(in srgb, var(--text) 8%, transparent);
	}
	.when {
		flex: none;
		width: 56px;
		font-size: var(--fs-xs);
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		text-decoration: none;
		font-size: var(--fs-md);
	}
	.title:hover {
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
	}
	.meta {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		max-width: 40%;
	}
	.proj {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.flag {
		color: var(--danger);
		font-weight: 600;
	}
	.flag.soft {
		font-weight: 500;
		color: var(--text-dim);
	}
	/* The calendar button: an icon over an invisible date box (the device's own date picker). */
	.plan {
		position: relative;
		flex: none;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text-faint);
		opacity: 0;
		cursor: pointer;
	}
	.item:hover .plan,
	.plan:focus-within {
		opacity: 1;
	}
	.plan:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.plan input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
	}
	.plan input::-webkit-calendar-picker-indicator {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	@media (hover: none) {
		.plus,
		.plan {
			opacity: 0.7;
		}
		/* Phones (15 Nov 2026): bigger places to tap, same look. */
		.plus,
		.plan {
			width: 40px;
			height: 40px;
		}
		.tick {
			position: relative;
			width: 20px;
			height: 20px;
		}
		.tick::after {
			content: '';
			position: absolute;
			inset: -11px;
		}
	}
	@media (max-width: 760px) {
		.up {
			padding: 16px 14px 96px;
		}
		header {
			margin-bottom: 16px;
		}
		.strip {
			width: 100%;
			justify-content: space-between;
		}
		.meta .proj {
			display: none;
		}
		.title {
			font-size: var(--fs-sm);
		}
	}
</style>
