<script lang="ts">
	// Tomorrow's priorities: each evening, choose what really needs doing tomorrow. A task chosen
	// for tomorrow gets the `today` label (it shows in Today on the home page).
	// Redone 13 Nov 2026 (Lou: as few sections as possible, only what is ahead, no figures), and
	// on 14 Nov "Planned for today, not done" became the first group of To consider, and Clean the
	// Inbox came first:
	//   0. Clean the Inbox: a link to it with what waits there; ticked once it is empty.
	//   1. Your list for tomorrow: what was chosen for tomorrow (★ takes it off).
	//   2. To consider: planned for today and not done (★ = still on the list for tomorrow), due by
	//      tomorrow, the week's list, next actions, due soon, due later, recently added
	//      (utils/reviews.ts), each with ☆.
	import { liveState } from '../../lib/db/live.svelte';
	import { getLabelIdByTitle, isSingleTasksProject } from '../../lib/db/queries';
	import { addTaskLabel, removeTaskLabel } from '../../lib/actions/tasks';
	import { db } from '../../lib/db/schema';
	import { tomorrowReview, weeklyReview, candidates as findCandidates, excludedProjectIds, plannedNotDone } from '../../lib/utils/reviews';
	import TaskList from '../../lib/components/TaskList.svelte';
	import ReviewStep from '../../lib/components/ReviewStep.svelte';
	import type { VikunjaTask } from '../../lib/types';
	import { dayPlans, refreshDayPlan, noteChosenForTomorrow } from '../../lib/stores/dayPlan.svelte';
	import { dayKey } from '../../lib/utils/dayPlan';
	import { onMount } from 'svelte';
	import Icon from '../../lib/components/Icon.svelte';
	import { inboxTicked, toggleInboxTick } from '../../lib/stores/inboxTick.svelte';

	onMount(() => void refreshDayPlan());

	const tasks = liveState(() => db.tasks.toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	// The projects the saved filter "Tomorrow" leaves out are left out here too.
	const filters = liveState(() => db.filters.toArray(), []);
	const todayLabelId = liveState(() => getLabelIdByTitle('today'), undefined);

	const r = $derived(tomorrowReview(tasks.value, projects.value));
	const inbox = $derived(weeklyReview(tasks.value, projects.value).inbox);
	const inboxDone = $derived(inboxTicked('tomorrow', inbox.length === 0));
	const hasToday = (t: VikunjaTask) => (t.labels ?? []).some((l) => l.title.toLowerCase() === 'today');

	// On today's list at some point today (utils/dayPlan.ts), still to do.
	const leftover = $derived(plannedNotDone(tasks.value, projects.value, new Set(dayPlans.plans[dayKey(new Date())] ?? [])));
	const leftoverIds = $derived(new Set(leftover.map((t) => t.id)));
	// 1. Chosen for tomorrow, apart from the tasks planned for today and not done.
	const chosen = $derived(r.chosen.filter((t) => !leftoverIds.has(t.id)));
	// 2. Everything else worth a look, in groups.
	const shown = $derived(new Set([...r.chosen, ...leftover].map((t) => t.id)));
	const groups = $derived.by(() => {
		const dueSoon = r.dueSoon.filter((t) => !shown.has(t.id));
		const skip = new Set([...shown, ...dueSoon.map((t) => t.id)]);
		const rest = findCandidates(tasks.value, projects.value, {
			skip,
			excluded: excludedProjectIds(filters.value.find((f) => f.title.toLowerCase() === 'tomorrow')?.filters?.filter),
			singleProjects: new Set(projects.value.filter((p) => isSingleTasksProject(p)).map((p) => p.id))
		}).map((g) => [g.group === 'Due soon' ? 'Due in the next two weeks' : g.group, g.tasks] as [string, VikunjaTask[]]);
		return [
			...(leftover.length ? [['Planned for today, not done', leftover] as [string, VikunjaTask[]]] : []),
			...(dueSoon.length ? [['Due by tomorrow', dueSoon] as [string, VikunjaTask[]]] : []),
			...rest
		];
	});
	let folded = $state<string[]>(['Due later', 'Recently added']);
	const toggleGroup = (g: string) => (folded = folded.includes(g) ? folded.filter((x) => x !== g) : [...folded, g]);

	const tomorrowName = $derived.by(() => {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
	});
	// More than this on one day's list: a gentle word, as a long list rarely gets finished.
	const MANY = 7;

	async function choose(id: number) {
		await noteChosenForTomorrow(id);
		if (todayLabelId.value) await addTaskLabel(id, todayLabelId.value);
	}
	async function unchoose(id: number) {
		if (todayLabelId.value) await removeTaskLabel(id, todayLabelId.value);
	}
</script>

<svelte:head>
	<title>Tomorrow — Tasks</title>
</svelte:head>

<!-- 15 Nov 2026: a moon (the menu's Tomorrow) instead of the star. -->
{#snippet star(t: VikunjaTask)}
	{#if hasToday(t)}
		<button class="choose on" onclick={() => unchoose(t.id)} title="Take it off tomorrow's list" aria-label="Take it off tomorrow's list" aria-pressed="true"><Icon name="moon" size={15} /></button>
	{:else}
		<button class="choose" onclick={() => choose(t.id)} title="Add it to tomorrow's list" aria-label="Add it to tomorrow's list" aria-pressed="false"><Icon name="moon" size={15} /></button>
	{/if}
{/snippet}

<div class="review page">
	<header class="top">
		<h1>Tomorrow</h1>
		<p class="intro">{tomorrowName}</p>
	</header>

	{#if !todayLabelId.value}
		<p class="note">Create a “today” label first (menu › Labels).</p>
	{/if}

	<ReviewStep n={1} id="inbox" title="Clean the Inbox" ticked={inboxDone} onTick={() => toggleInboxTick('tomorrow', inbox.length === 0)} period="for today">
		<!-- 14 Nov 2026: the box ticks itself when the Inbox is empty, and by hand (kept until the app
		     is reloaded); only Open goes to the Inbox. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the box is the keyboard control) -->
		<div class="inrow" class:done={inboxDone} onclick={(e) => !(e.target as HTMLElement).closest('a, button') && toggleInboxTick('tomorrow', inbox.length === 0)}>
			<button class="box" role="checkbox" aria-checked={inboxDone} aria-label="Inbox" title="Ticks itself once the Inbox is empty; click to tick it yourself" onclick={() => toggleInboxTick('tomorrow', inbox.length === 0)}>{inboxDone ? '✓' : ''}</button>
			<span class="rlabel">Inbox</span>
			{#if inbox.length}<span class="rhint">{inbox.slice(0, 3).map((t) => t.title).join(' · ')}</span><a class="open" href="/inbox">Open ›</a>{:else}<span class="rhint">Empty</span>{/if}
		</div>
	</ReviewStep>

	<ReviewStep n={2} id="chosen" title="Your list for tomorrow" open>
		{#if r.chosen.length > MANY}
			<p class="note">A lot for one day.</p>
		{/if}
		<TaskList tasks={chosen} emptyLabel={leftover.length ? 'Nothing else yet' : 'Nothing chosen yet'} simple projectWidth="150px" lead={star} />
	</ReviewStep>

	<ReviewStep n={3} id="consider" title="To consider" open>
		{#each groups as [name, list] (name)}
			<button class="group" onclick={() => toggleGroup(name)} aria-expanded={!folded.includes(name)}><span class="gchev" class:open={!folded.includes(name)}>›</span> {name}</button>
			{#if !folded.includes(name)}
				<div data-group={name}><TaskList tasks={list} emptyLabel="" simple projectWidth="150px" lead={star} /></div>
			{/if}
		{:else}
			<p class="empty">Nothing else.</p>
		{/each}
	</ReviewStep>
</div>

<style>
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
	.intro {
		color: var(--text-dim);
		font-size: var(--fs-sm);
		margin: 0;
	}
	.note {
		font-size: var(--fs-sm);
		color: var(--text-dim);
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		border-radius: var(--radius);
		padding: 8px 12px;
		margin: 0 0 12px;
	}
	.inrow {
		display: flex;
		cursor: pointer;
		align-items: center;
		gap: 12px;
		min-height: 40px;
		padding: 4px 8px;
		margin: 0 -8px;
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
	}
	/* Greyed on hover, like the other ticks (14 Nov 2026). */
	.inrow:hover {
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
	.inrow.done .box {
		background: var(--accent);
		border-color: var(--accent);
	}
	.inrow.done .rlabel {
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
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		margin: 4px 0;
	}
	.group {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-dim);
		margin: 12px 0 2px;
		padding: 2px 0;
	}
	.group:first-child {
		margin-top: 0;
	}
	.gchev {
		display: inline-block;
		transition: transform 0.12s;
	}
	.gchev.open {
		transform: rotate(90deg);
	}
</style>
