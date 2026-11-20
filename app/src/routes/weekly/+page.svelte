<script lang="ts">
	// Weekly review. Redone 13 Nov 2026 (Lou: as few sections as possible, only what is ahead, no
	// figures; on Sundays it replaces Tomorrow's priorities, so Tomorrow's choices are here too):
	//   1. Clean up: the computer (Desktop, Downloads, Emails) and the Inbox.
	//   2. Review: projects without a next action, pending projects and tasks, waiting for,
	//      untouched for 60 days.
	//   3. Plan the coming week: the week's list (label "week"), then, in groups: planned this week
	//      and not done (on a day's list, utils/dayPlan.ts, or on the week's list; a group since
	//      14 Nov 2026, before a step), overdue, due in the next 7 days, next actions, and so on.
	// On every task of step 3: ☆ / ★ the week's list, and Tomorrow (the "today" label).
	// Steps 1 and 2 are ticked by hand for the week (on all devices, like the Desktop ticks).
	import { setTaskPending, abandonTask, deleteTask, addTaskLabel, removeTaskLabel } from '../../lib/actions/tasks';
	import { liveState } from '../../lib/db/live.svelte';
	import { getProjectsWithoutNextAction, getPendingProjects, getLabelIdByTitle, isSingleTasksProject } from '../../lib/db/queries';
	import { setProjectPending } from '../../lib/actions/projects';
	import { goto } from '$app/navigation';
	import { db } from '../../lib/db/schema';
	import { inferredContext, rootProjectTitle } from '../../lib/utils/context';
	import { isBinProject } from '../../lib/utils/bin';
	import { weeklyReview, UNTOUCHED_DAYS, candidates as findCandidates, excludedProjectIds, plannedNotDone, WEEK_LABEL } from '../../lib/utils/reviews';
	import { ensureLabel } from '../../lib/actions/labels';
	import TaskList from '../../lib/components/TaskList.svelte';
	import ReviewStep from '../../lib/components/ReviewStep.svelte';
	import type { VikunjaProject, VikunjaTask } from '../../lib/types';
	import { ROUTINE_ITEMS } from '../../lib/utils/weeklyRoutine';
	import { routine, loadRoutine, toggleRoutine } from '../../lib/stores/weeklyRoutine.svelte';
	import { dayPlans, refreshDayPlan, noteChosenForTomorrow } from '../../lib/stores/dayPlan.svelte';
	import { lastDays } from '../../lib/utils/dayPlan';
	import { onMount } from 'svelte';
	import Icon from '../../lib/components/Icon.svelte';
	import { inboxTicked, toggleInboxTick } from '../../lib/stores/inboxTick.svelte';

	onMount(() => {
		void loadRoutine();
		void refreshDayPlan();
	});

	const tasks = liveState(() => db.tasks.toArray(), []);
	const allProjects = liveState(() => db.projects.toArray(), []);
	const filters = liveState(() => db.filters.toArray(), []);
	const todayLabelId = liveState(() => getLabelIdByTitle('today'), undefined);
	const staleAll = liveState(() => getProjectsWithoutNextAction(), []);
	// Not the Bin, nor archived projects, nor the Shopping list and the "Single tasks" projects,
	// whose tasks are each their own next step.
	const stale = $derived(staleAll.value.filter((p) => !p.is_archived && !isBinProject(p) && p.title.trim().toLowerCase() !== 'shopping' && !/^single tasks\b/i.test(p.title.trim())));
	const pendingProjects = liveState(() => getPendingProjects(), []);
	const r = $derived(weeklyReview(tasks.value, allProjects.value));

	const has = (t: VikunjaTask, name: string) => (t.labels ?? []).some((l) => l.title.trim().toLowerCase() === name);
	const stepDone = (id: string) => routine.done.includes(`step-${id}`);
	const inboxDone = $derived(inboxTicked('weekly', r.inbox.length === 0));
	const routineClear = $derived(ROUTINE_ITEMS.every((i) => routine.done.includes(i.id)) && inboxDone);

	// Planned this week, not done: on a day's list in the last 7 days, or on the week's list when
	// the page was opened (a task starred for the coming week while here goes to step 4).
	let weekAtOpen = $state<Set<number> | null>(null);
	$effect(() => {
		if (weekAtOpen === null && tasks.value.length) weekAtOpen = new Set(tasks.value.filter((t) => has(t, WEEK_LABEL)).map((t) => t.id));
	});
	const missed = $derived.by(() => {
		const ids = new Set<number>(weekAtOpen ?? []);
		for (const k of lastDays(7)) for (const id of dayPlans.plans[k] ?? []) ids.add(id);
		return plannedNotDone(tasks.value, allProjects.value, ids);
	});
	// 3. The week's list (if not planned this week and not done), then the rest worth a look.
	const missedIds = $derived(new Set(missed.map((t) => t.id)));
	const weekList = $derived(tasks.value.filter((t) => !t.done && has(t, WEEK_LABEL) && !missedIds.has(t.id)));
	const groups = $derived.by(() => {
		const seen = new Set([...missedIds, ...weekList.map((t) => t.id)]);
		const overdue = r.overdue.filter((t) => !seen.has(t.id));
		const next7 = r.nextWeek.filter((t) => !seen.has(t.id));
		const skip = new Set([...seen, ...overdue.map((t) => t.id), ...next7.map((t) => t.id)]);
		const rest = findCandidates(tasks.value, allProjects.value, {
			horizonDays: 7,
			withWeek: false,
			skip,
			excluded: excludedProjectIds(filters.value.find((f) => f.title.toLowerCase() === 'tomorrow')?.filters?.filter),
			singleProjects: new Set(allProjects.value.filter((p) => isSingleTasksProject(p)).map((p) => p.id))
		}).map((g) => [g.group === 'Due soon' ? 'Due in the next two weeks' : g.group, g.tasks] as [string, VikunjaTask[]]);
		const out: [string, VikunjaTask[]][] = [];
		if (missed.length) out.push(['Planned this week, not done', missed]);
		if (overdue.length) out.push(['Overdue', overdue]);
		if (next7.length) out.push(['Due in the next 7 days', next7]);
		return [...out, ...rest];
	});
	let folded = $state<string[]>(['Due later', 'Recently added', 'Waiting for', `Untouched for ${UNTOUCHED_DAYS} days`]);
	const toggle = (g: string) => (folded = folded.includes(g) ? folded.filter((x) => x !== g) : [...folded, g]);

	async function weekPick(id: number) {
		await addTaskLabel(id, await ensureLabel(WEEK_LABEL, '1e88e5'));
	}
	async function weekDrop(id: number) {
		const l = (await db.labels.toArray()).find((x) => x.title.trim().toLowerCase() === WEEK_LABEL);
		if (l) await removeTaskLabel(id, l.id);
	}
	async function toggleTomorrow(t: VikunjaTask) {
		const id = todayLabelId.value ?? (await ensureLabel('today', '000000'));
		if (has(t, 'today')) await removeTaskLabel(t.id, id);
		else {
			await noteChosenForTomorrow(t.id);
			await addTaskLabel(t.id, id);
		}
	}

	const byId = $derived(new Map(allProjects.value.map((p) => [p.id, p])));
	// Pro and Perso are listed separately, but both on this one page.
	function grouped(list: VikunjaProject[]) {
		const g: Record<string, VikunjaProject[]> = { Pro: [], Perso: [], Other: [] };
		for (const p of list) g[inferredContext(p.id, byId) ?? 'Other'].push(p);
		return Object.entries(g).filter(([, l]) => l.length > 0);
	}
	const parentName = (p: VikunjaProject) => {
		const root = rootProjectTitle(p.id, byId);
		return root && root !== p.title ? root : '';
	};
	const nextWeekRange = $derived.by(() => {
		const a = new Date();
		a.setDate(a.getDate() + 1);
		const b = new Date(a.getTime() + 6 * 86_400_000);
		const o = { day: 'numeric', month: 'short' } as const;
		return `${a.toLocaleDateString('en-GB', o)} – ${b.toLocaleDateString('en-GB', o)}`;
	});
	async function activate(id: number) {
		await setProjectPending(id, false);
		goto(`/project/${id}`);
	}
	const reviewEmpty = $derived(!stale.length && !pendingProjects.value.length && !r.pending.length && !r.waiting.length && !r.untouched.length);
</script>

<svelte:head>
	<title>Weekly review — Tasks</title>
</svelte:head>

<!-- 15 Nov 2026: the Weekly review's calendar for the week's list, and the moon of Tomorrow, side
     by side in place of the circle (before: a star, and a Tomorrow button on the right). -->
{#snippet weekStar(t: VikunjaTask)}
	{#if has(t, WEEK_LABEL)}
		<button class="choose on" onclick={() => weekDrop(t.id)} title="Take it off the week's list" aria-label="Take it off the week's list" aria-pressed="true"><Icon name="calendar" size={15} /></button>
	{:else}
		<button class="choose" onclick={() => weekPick(t.id)} title="Add it to the week's list" aria-label="Add it to the week's list" aria-pressed="false"><Icon name="calendar" size={15} /></button>
	{/if}
	<button class="choose" class:on={has(t, 'today')} aria-pressed={has(t, 'today')} aria-label="Tomorrow" onclick={() => toggleTomorrow(t)} title={has(t, 'today') ? "Take it off tomorrow's list" : "Add it to tomorrow's list"}><Icon name="moon" size={15} /></button>
{/snippet}
{#snippet fold(name: string)}
	<button class="group fold" onclick={() => toggle(name)} aria-expanded={!folded.includes(name)}><span class="gchev" class:open={!folded.includes(name)}>›</span> {name}</button>
{/snippet}

<div class="review page">
	<header class="top">
		<h1>Weekly review</h1>
		<p class="intro">For {nextWeekRange}</p>
	</header>

	<ReviewStep n={1} id="clean" ticked={stepDone('clean') || routineClear} onTick={() => toggleRoutine('step-clean')} title="Clean up">
		<ul class="routine">
			{#each ROUTINE_ITEMS as item (item.id)}
				{@const done = routine.done.includes(item.id)}
				<li>
					<button class="rtick" class:done role="checkbox" aria-checked={done} onclick={() => toggleRoutine(item.id)}>
						<span class="box" aria-hidden="true">{done ? '✓' : ''}</span>
						<span class="rlabel">{item.label}</span>
					</button>
				</li>
			{/each}
			<li>
				<!-- 14 Nov 2026: the box ticks itself when the Inbox is empty, and by hand (kept until the
				     app is reloaded); only Open goes to the Inbox. -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the box is the keyboard control) -->
				<div class="rtick inbox" class:done={inboxDone} onclick={(e) => !(e.target as HTMLElement).closest('a, button') && toggleInboxTick('weekly', r.inbox.length === 0)}>
					<button class="box" role="checkbox" aria-checked={inboxDone} aria-label="Inbox" title="Ticks itself once the Inbox is empty; click to tick it yourself" onclick={() => toggleInboxTick('weekly', r.inbox.length === 0)}>{inboxDone ? '✓' : ''}</button>
					<span class="rlabel">Inbox</span>
					{#if r.inbox.length}<span class="rhint">{r.inbox.slice(0, 3).map((t) => t.title).join(' · ')}</span><a class="open" href="/inbox">Open ›</a>{:else}<span class="rhint">Empty</span>{/if}
				</div>
			</li>
		</ul>
	</ReviewStep>

	<ReviewStep n={2} id="review" ticked={stepDone('review') || reviewEmpty} onTick={() => toggleRoutine('step-review')} title="Projects and tasks on hold">
		{#if stale.length}
			{@render fold('Projects without a next action')}
			{#if !folded.includes('Projects without a next action')}
				{#each grouped(stale) as [name, list] (name)}
					<div class="ctx">{name}</div>
					{#each list as p (p.id)}
						<a href="/project/{p.id}" class="prow">
							<span class="ptitle">{#if parentName(p)}<span class="parent">{parentName(p)} /</span>{/if}{p.title}</span>
							<span class="go" aria-hidden="true">›</span>
						</a>
					{/each}
				{/each}
			{/if}
		{/if}
		{#if pendingProjects.value.length}
			{@render fold('Pending projects')}
			{#if !folded.includes('Pending projects')}
				{#each grouped(pendingProjects.value) as [name, list] (name)}
					<div class="ctx">{name}</div>
					{#each list as p (p.id)}
						<div class="prow">
							<a class="ptitle" href="/project/{p.id}">{#if parentName(p)}<span class="parent">{parentName(p)} /</span>{/if}{p.title}</a>
							<button class="btn" onclick={() => activate(p.id)}>Activate</button>
						</div>
					{/each}
				{/each}
			{/if}
		{/if}
		{#if r.pending.length}
			{@render fold('Pending tasks')}
			{#if !folded.includes('Pending tasks')}
				<TaskList tasks={r.pending} emptyLabel="" simple projectWidth="150px">
					{#snippet extra(t)}
						<button class="btn" onclick={() => setTaskPending(t.id, false)} title="Take it off hold">Resume</button>
					{/snippet}
				</TaskList>
			{/if}
		{/if}
		{#if r.waiting.length}
			{@render fold('Waiting for')}
			{#if !folded.includes('Waiting for')}
				<TaskList tasks={r.waiting} emptyLabel="" simple projectWidth="150px" />
			{/if}
		{/if}
		{#if r.untouched.length}
			{@render fold(`Untouched for ${UNTOUCHED_DAYS} days`)}
			{#if !folded.includes(`Untouched for ${UNTOUCHED_DAYS} days`)}
				<TaskList tasks={r.untouched} emptyLabel="" simple projectWidth="150px">
					{#snippet extra(t)}
						<button class="btn" onclick={() => abandonTask(t.id)} title="Close it without doing it">Abandon</button>
						<button class="btn bin" onclick={() => deleteTask(t.id)} aria-label="Move to the Bin" title="Move to the Bin">Bin</button>
					{/snippet}
				</TaskList>
			{/if}
		{/if}
		{#if reviewEmpty}<p class="empty">Nothing on hold.</p>{/if}
	</ReviewStep>

	<ReviewStep n={3} id="plan" title="Plan the coming week" open>
		<div class="group">Your list for the week</div>
		<TaskList tasks={weekList} emptyLabel={missed.length ? 'Nothing else yet' : 'Nothing chosen yet'} simple projectWidth="150px" lead={weekStar} />
		{#each groups as [name, list] (name)}
			{@render fold(name)}
			{#if !folded.includes(name)}
				<div data-group={name}><TaskList tasks={list} emptyLabel="" simple projectWidth="150px" lead={weekStar} /></div>
			{/if}
		{/each}
	</ReviewStep>
</div>

<style>
	.routine {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.rtick {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 40px;
		padding: 4px 8px;
		margin: 0 -8px;
		border-radius: var(--radius);
		text-align: left;
		color: var(--text);
	}
	.rtick:hover {
		background: var(--bg-hover);
	}
	.open {
		flex: none;
		margin-left: auto;
		padding: 4px 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		font-size: var(--fs-sm);
		color: var(--text);
		text-decoration: none;
	}
	.rtick.inbox {
		cursor: pointer;
	}
	.open {
		background: var(--bg);
	}
	.open:hover {
		border-color: var(--border-strong, var(--text-faint));
	}
	.box {
		flex: none;
		width: 20px;
		height: 20px;
		border: 1.5px solid var(--border-strong, var(--text-faint));
		border-radius: 5px;
		display: grid;
		place-items: center;
		font-size: 13px;
		font-weight: 700;
		color: var(--accent-contrast, #fff);
	}
	.rtick.done .box {
		background: var(--accent);
		border-color: var(--accent);
	}
	.rlabel {
		font-size: var(--fs-md);
	}
	.rtick.done .rlabel {
		color: var(--text-dim);
		text-decoration: line-through;
	}
	.rhint {
		flex: 1;
		min-width: 0;
		color: var(--text-faint);
		font-size: var(--fs-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 600px) {
		.rhint {
			display: none;
		}
	}
	.review {
		max-width: 1040px;
	}
	.top {
		margin: 4px 0 18px;
	}
	h1 {
		font-size: var(--fs-xl);
		letter-spacing: -0.01em;
		margin: 0 0 4px;
	}
	.group {
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-dim);
		margin: 14px 0 2px;
	}
	.group:first-child {
		margin-top: 0;
	}
	.ctx {
		font-size: var(--fs-2xs);
		font-weight: 600;
		color: var(--text-faint);
		margin: 6px 0 0;
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		margin: 4px 0;
	}
	.rtick.inbox .rhint {
		margin-left: 4px;
	}
	.group.fold {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		padding: 2px 0;
	}
	.gchev {
		display: inline-block;
		transition: transform 0.12s;
	}
	.gchev.open {
		transform: rotate(90deg);
	}
	.prow {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 40px;
		padding: 4px 8px;
		margin: 0 -8px;
		border-radius: var(--radius);
		color: var(--text);
	}
	a.prow:hover,
	div.prow:hover {
		background: var(--bg-hover);
	}
	.ptitle {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		font-size: var(--fs-md);
	}
	.parent {
		color: var(--text-faint);
		margin-right: 6px;
		font-size: var(--fs-sm);
	}
	.go {
		color: var(--text-faint);
	}
	.review {
		--col-extra: 96px;
	}
	.review :global([data-step='review']) {
		--col-extra: 150px;
	}
	.review :global(.extra) {
		justify-content: flex-end;
	}
	.bin {
		height: 28px;
		padding: 0 10px;
		font-size: var(--fs-xs);
	}
</style>
