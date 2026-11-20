<script lang="ts">
	// Inbox page (13 Nov 2026; before, the Inbox was a view of the home page chosen in the top bar):
	// the tasks still to sort, newest first unless you switch the order. A task shown here stays
	// until you validate, complete or bin it (stores/inboxSticky.ts).
	import { liveState } from '../../lib/db/live.svelte';
	import { getHomeBlocks } from '../../lib/db/queries';
	import TaskList from '../../lib/components/TaskList.svelte';
	import { db } from '../../lib/db/schema';
	import { olderFirst } from '../../lib/utils/order';
	import { keepInInbox, markShown, firstTrace } from '../../lib/stores/inboxSticky';
	import { recordError } from '../../lib/stores/errorReport';
	import { validatedMarkInUse } from '../../lib/utils/context';

	const blocks = liveState(() => getHomeBlocks('input').then((b) => ({ unsorted: b.unsorted, ready: true })), { unsorted: [] as Awaited<ReturnType<typeof getHomeBlocks>>['unsorted'], ready: false });
	const projects = liveState(() => db.projects.toArray(), []);
	const allTasks = liveState(() => db.tasks.toArray(), []);

	function readOrder(): 'newest' | 'oldest' {
		try {
			return localStorage.getItem('inbox_order') === 'oldest' ? 'oldest' : 'newest';
		} catch {
			return 'newest';
		}
	}
	let order = $state<'newest' | 'oldest'>(readOrder());
	function switchOrder() {
		order = order === 'newest' ? 'oldest' : 'newest';
		try {
			localStorage.setItem('inbox_order', order);
		} catch {
			// not remembered
		}
	}

	const tasks = $derived.by(() => {
		const base = blocks.value.unsorted;
		const here = new Set(base.map((t) => t.id));
		const kept = blocks.value.ready ? allTasks.value.filter((t) => !t.done && !here.has(t.id) && keepInInbox(t.id)) : [];
		return [...base, ...kept].sort((a, b) => (order === 'newest' ? olderFirst(b, a) : olderFirst(a, b)));
	});
	$effect(() => {
		if (!blocks.value.ready) return;
		markShown(blocks.value.unsorted.map((t) => t.id));
		const here = new Set(blocks.value.unsorted.map((t) => t.id));
		for (const t of tasks) {
			if (here.has(t.id) || !firstTrace(t.id)) continue;
			const p = projects.value.find((x) => x.id === t.project_id);
			recordError('trace', `Inbox: task #${t.id} would have left the Inbox without validation; kept. Device saw: project "${p?.title ?? '?'}"${p?.is_archived ? ' (archived)' : ''}, labels [${(t.labels ?? []).map((l) => l.title).join(', ')}], validated-mark rule ${validatedMarkInUse() ? 'on' : 'off'}, done ${t.done}`);
		}
	});
</script>

<svelte:head>
	<title>Inbox · Tasks</title>
</svelte:head>

<div class="page">
	<div class="head">
		<h1>Inbox</h1>
		<button class="order" onclick={switchOrder} title="Change the order" aria-label="Order: {order === 'newest' ? 'newest first' : 'oldest first'}. Click to switch.">
			{order === 'newest' ? 'Newest first' : 'Oldest first'}
			<span aria-hidden="true">{order === 'newest' ? '↓' : '↑'}</span>
		</button>
	</div>
	<TaskList {tasks} emptyLabel="Nothing to process" sortContext />
</div>

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	h1 {
		font-size: var(--fs-xl);
		letter-spacing: -0.01em;
		margin: 0;
	}
	.order {
		font-size: var(--fs-xs);
		color: var(--text-dim);
		padding: 4px 8px;
		border-radius: var(--radius);
	}
	.order:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
</style>
