<script lang="ts">
	import Icon from './Icon.svelte';
	import { toastStore } from '../stores/toast.svelte';
	import DateField from './DateField.svelte';
	// Phone: a long press on a task opens this menu, to change its project, labels or dates, move
	// it to the Bin or open it, without leaving the list. The back gesture closes it (Modal).
	import { goto } from '$app/navigation';
	import Modal from './Modal.svelte';
	import ProjectPicker from './ProjectPicker.svelte';
	import LabelPopover from './LabelPopover.svelte';
	import { moveTaskToProject, updateTask, deleteTask, abandonTask } from '../actions/tasks';
	import { getInboxProject } from '../db/queries';
	import { visibleLabels } from '../utils/context';
	import { hasDate, toDatetimeLocal, endOfDayIso } from '../utils/dates';
	import type { VikunjaTask } from '../types';

	let { task, onClose, onSelectMany }: { task: VikunjaTask; onClose: () => void; onSelectMany?: () => void } = $props();
	let view = $state<'menu' | 'project' | 'labels' | 'due' | 'start'>('menu');

	const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
	const quick = [
		{ label: 'Today', days: 0 },
		{ label: 'Tomorrow', days: 1 },
		{ label: 'In a week', days: 7 }
	];
	async function setDate(field: 'due_date' | 'start_date', iso: string | null) {
		await updateTask(task.id, { [field]: iso });
		onClose();
	}
	async function bin() {
		onClose();
		await deleteTask(task.id); // shows "Moved to the Bin" with Undo
	}
</script>

<Modal title={task.title} {onClose}>
	<div class="sheet">
		{#if view === 'menu'}
			{#if onSelectMany}
				<!-- 11 Nov 2026: starts a selection of several tasks; then a tap adds or removes one. -->
				<button class="item" onclick={() => { onClose(); onSelectMany(); }}><span>Select several tasks</span><span class="dim"><Icon name="check" size={14} /></span></button>
			{/if}
			<button class="item" onclick={() => (view = 'project')}><span>Project</span><span class="dim">›</span></button>
			<button class="item" onclick={() => (view = 'labels')}><span>Labels</span><span class="dim">›</span></button>
			<button class="item" onclick={() => (view = 'due')}>
				<span>Due date</span><span class="dim">{hasDate(task.due_date) ? fmt(task.due_date) : 'none'} ›</span>
			</button>
			<button class="item" onclick={() => (view = 'start')}>
				<span>Start date</span><span class="dim">{hasDate(task.start_date) ? fmt(task.start_date!) : 'none'} ›</span>
			</button>
			<button class="item" onclick={() => { onClose(); goto(`/task/${task.id}`); }}><span>Open the task</span><span class="dim">›</span></button>
			{#if !task.done}<button class="item" onclick={() => { onClose(); void abandonTask(task.id).then(() => toastStore.success('Abandoned: in the Bin')); }}><span>Abandon</span></button>{/if}
			<button class="item danger" onclick={bin}><span>Move to the Bin</span></button>
		{:else}
			<button class="back" onclick={() => (view = 'menu')}>‹ Back</button>
			<div class="embed">
				{#if view === 'project'}
					<ProjectPicker
						onSelect={async (p) => { await moveTaskToProject(task.id, p.id); onClose(); }}
						onNone={async () => { const inbox = await getInboxProject(); if (inbox) await moveTaskToProject(task.id, inbox.id); onClose(); }}
						onClose={() => (view = 'menu')}
					/>
				{:else if view === 'labels'}
					<LabelPopover taskId={task.id} assignedLabels={visibleLabels(task.labels)} onClose={() => (view = 'menu')} />
				{:else}
					{@const field = view === 'due' ? 'due_date' : 'start_date'}
					{@const current = view === 'due' ? task.due_date : task.start_date}
					<div class="dates">
						{#each quick as q (q.label)}
							<button class="btn" onclick={() => setDate(field, endOfDayIso(q.days))}>{q.label}</button>
						{/each}
					</div>
					{#key view}<DateField kind={view === 'due' ? 'due' : 'start'} value={current} onCommit={(iso) => setDate(field, iso)} />{/key}
					{#if hasDate(current)}<button class="btn clear" onclick={() => setDate(field, null)}>Remove the date</button>{/if}
				{/if}
			</div>
		{/if}
	</div>
</Modal>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
	}
	.item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 48px;
		padding: 0 4px;
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-md);
		text-align: left;
		color: var(--text);
	}
	.item:last-child {
		border-bottom: none;
	}
	.danger {
		color: var(--danger);
	}
	.dim {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
	.back {
		align-self: flex-start;
		padding: 6px 0 10px;
		color: var(--text-dim);
		font-size: var(--fs-sm);
	}
	.embed :global(.popover) {
		position: static;
		width: 100%;
		box-shadow: none;
		border: none;
		padding: 0;
	}
	.dates {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.embed :global(.datefield) {
		width: 100%;
	}
	.embed :global(.datefield .day) {
		flex: 1;
	}
	.clear {
		margin-top: 10px;
	}
</style>
