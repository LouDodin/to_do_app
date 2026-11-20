<script lang="ts">
	// Owns selection + keyboard shortcuts for one list of tasks, per spec
	// ("Sélection et raccourcis clavier sur les listes de tâches"):
	// ↑/↓ navigate, x/space complete, r rename, l labels, m move project,
	// Backspace delete, Enter/o open the task's page.
	import { goto } from '$app/navigation';
	import { SelectionStore } from '../stores/selection.svelte';
	import { activeList } from '../stores/activeList.svelte';
	import { completeTask, deleteTask, validateTask, moveTaskToProject } from '../actions/tasks';
	import { getInboxProject } from '../db/queries';
	import { toastStore } from '../stores/toast.svelte';
	import { isInboxProject, isTaskPending } from '../utils/context';
	import { liveState } from '../db/live.svelte';
	import { db } from '../db/schema';
	import TaskRow from './TaskRow.svelte';
	import { multiSelect, isMultiSelected, toggleMulti, rangeMulti, setAnchor, clearMulti, draggedIds, registerList, unregisterList } from '../stores/multiSelect.svelte';
	import type { VikunjaTask } from '../types';
	import type { Snippet } from 'svelte';

	// `tasks` may include completed ones — this component owns the
	// show/hide-completed toggle itself (default: hidden), so every list
	// in the app gets the same behaviour without each page repeating it.
	// `showProject`: set on lists that mix tasks from several projects
	// (currently just the home page's blocks) so each row can show which
	// project it belongs to.
	let {
		tasks,
		emptyLabel = 'No tasks',
		showProject = true,
		sortContext = false,
		simple = false,
		projectWidth = undefined,
		extra,
		onDropOnTask,
		completed = 'toggle',
		columnHeads = true,
		lead = undefined
	}: {
		tasks: VikunjaTask[];
		emptyLabel?: string;
		showProject?: boolean;
		sortContext?: boolean;
		simple?: boolean;
		projectWidth?: string;
		// Optional control shown at the right of every row (e.g. the "+ today" button).
		extra?: Snippet<[VikunjaTask]>;
		// Given: a task (or several selected ones) dropped on a row goes just before or after it.
		onDropOnTask?: (ids: number[], targetId: number, after: boolean) => void;
		// 'toggle' (default): the list's own "Show completed" line. 'show' / 'hide': the page decides
		// for all its lists at once, and the line is not shown (project page, 13 Nov 2026).
		completed?: 'toggle' | 'show' | 'hide';
		// The line of column names above the rows (Project, Start, Due, Links).
		columnHeads?: boolean;
		// Shown in place of each row's completion circle.
		lead?: Snippet<[VikunjaTask]>;
	} = $props();

	let dropAt = $state<{ id: number; after: boolean } | null>(null);
	function rowDragOver(e: DragEvent, id: number) {
		if (!onDropOnTask || !e.dataTransfer?.types.includes('application/x-task-id')) return;
		e.preventDefault();
		e.stopPropagation();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropAt = { id, after: e.clientY > r.top + r.height / 2 };
	}
	function rowDrop(e: DragEvent, id: number) {
		if (!onDropOnTask) return;
		const ids = draggedIds(e);
		const where = dropAt;
		dropAt = null;
		if (!ids.length || ids.includes(id)) return;
		e.preventDefault();
		e.stopPropagation();
		onDropOnTask(ids, id, where?.id === id ? where.after : false);
	}

	// Cheap even when unused (a few dozen id/title pairs); only rendered
	// per-row when showProject is true.
	const projects = liveState(() => db.projects.toArray(), []);
	// Name of the top-level project a project sits under (nothing when it is the top level itself).
	function rootNameOf(projectId: number): string | undefined {
		let p = projectMap.get(projectId);
		let guard = 0;
		while (p?.parent_project_id && guard++ < 30) {
			const up = projectMap.get(p.parent_project_id);
			if (!up) break;
			p = up;
		}
		return p && p.id !== projectId ? p.title : undefined;
	}
	const projectNames = $derived(new Map(projects.value.map((p) => [p.id, p.title])));

	const projectMap = $derived(new Map(projects.value.map((p) => [p.id, p])));
	const selection = new SelectionStore();
	const listId = activeList.nextId();
	let editingId = $state<number | null>(null);
	let labelPopoverId = $state<number | null>(null);
	let movePopoverId = $state<number | null>(null);
	let showCompleted = $state(false);

	// Pending (on hold) tasks come after the others (10 Nov 2026).
	const openTasks = $derived([...tasks.filter((t) => !t.done && !isTaskPending(t)), ...tasks.filter((t) => !t.done && isTaskPending(t))]);
	const completedTasks = $derived(tasks.filter((t) => t.done));
	const withDone = $derived(completed === 'toggle' ? showCompleted : completed === 'show');
	const visibleTasks = $derived(withDone ? [...openTasks, ...completedTasks] : openTasks);

	const ids = $derived(visibleTasks.map((t) => t.id));
	// Known to the selection of several tasks (Shift-click, Select all).
	$effect(() => {
		registerList(listId, ids);
	});
	$effect(() => () => unregisterList(listId));
	function pick(id: number, mode: 'toggle' | 'range') {
		activeList.setActive(listId);
		if (mode === 'range' && multiSelect.anchorList === listId && multiSelect.anchorId !== null) rangeMulti(id, listId, ids);
		else toggleMulti(id, listId);
	}

	$effect(() => {
		// First list rendered on a page claims keyboard nav by default, so
		// arrow keys work immediately without requiring a click first.
		if (activeList.activeId === null) activeList.setActive(listId);
	});

	function closeAllPopovers() {
		labelPopoverId = null;
		movePopoverId = null;
	}

	async function handleKeydown(e: KeyboardEvent) {
		if (activeList.activeId !== listId) return; // another list on this page owns keyboard nav
		if (editingId !== null) return; // let the inline rename input handle its own keys
		const target = e.target as HTMLElement;
		if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

		if (e.key === 'ArrowDown' || e.key === 'j') {
			e.preventDefault();
			selection.moveNext(ids);
			closeAllPopovers();
		} else if (e.key === 'ArrowUp' || e.key === 'k') {
			e.preventDefault();
			selection.movePrev(ids);
			closeAllPopovers();
		} else if (e.key === 'Escape') {
			if (labelPopoverId !== null || movePopoverId !== null) closeAllPopovers();
			else selection.clear();
		} else if (selection.selectedId !== null) {
			const id = selection.selectedId;
			if (e.key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				const inbox = await getInboxProject();
				if (inbox) await moveTaskToProject(id, inbox.id);
			} else if (sortContext && (e.key === 'v' || e.key === 'V')) {
				e.preventDefault();
				const t = visibleTasks.find((t) => t.id === id);
				if (t && !isInboxProject(t.project_id, projectMap)) validateTask(id);
			} else if (e.key === 'x' || e.key === ' ') {
				e.preventDefault();
				const t = visibleTasks.find((t) => t.id === id);
				if (t && sortContext && !t.done) {
					// Inbox view: a task must be defined before it can be completed.
					if (!isInboxProject(t.project_id, projectMap)) {
						await validateTask(id);
						completeTask(id, true);
					} else toastStore.error("Can't complete this task yet: choose a project first.");
				} else if (t) completeTask(id, !t.done);
			} else if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				if (confirm('Move this task to the Bin? You can restore it for 30 days.')) deleteTask(id);
			} else if (e.key === 'r') {
				e.preventDefault();
				editingId = id;
			} else if (e.key === 'l') {
				e.preventDefault();
				movePopoverId = null;
				labelPopoverId = id;
			} else if (e.key === 'm') {
				e.preventDefault();
				labelPopoverId = null;
				movePopoverId = id;
			} else if (e.key === 'Enter' || e.key === 'o') {
				e.preventDefault();
				goto(`/task/${id}`);
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if completedTasks.length > 0 && completed === 'toggle'}
	<button class="completed-toggle" class:active={showCompleted} onclick={() => (showCompleted = !showCompleted)}>
		{showCompleted ? 'Hide completed' : `Show completed (${completedTasks.length})`}
	</button>
{/if}

{#if visibleTasks.length > 0 && columnHeads}
	<div class="head" aria-hidden="true" style:--col-project={projectWidth ?? (simple ? '240px' : undefined)}>
		<span class="h-main"></span>
		<span class="h-project">Project</span>
		{#if !simple}<span class="h-date">Start</span>{/if}
		<span class="h-date">Due</span>
		{#if !simple}<span class="h-link">Links</span>{/if}
		<span class="h-icon"></span>
		{#if sortContext}<span class="h-circle"></span>{/if}
		{#if extra}<span class="h-extra"></span>{/if}
	</div>
{/if}

<div class="list">
	{#each visibleTasks as task (task.id)}
		<div
			class="slot"
			class:with-extra={!!extra}
			class:drop-before={dropAt?.id === task.id && !dropAt.after}
			class:drop-after={dropAt?.id === task.id && dropAt.after}
			role="listitem"
			ondragover={(e) => rowDragOver(e, task.id)}
			ondragleave={() => dropAt?.id === task.id && (dropAt = null)}
			ondrop={(e) => rowDrop(e, task.id)}
		>
		<div class:grow={!!extra}>
		<TaskRow
			{task}
			{sortContext}
			{simple}
			{projectWidth}
			{lead}
			projectRoot={simple && showProject ? rootNameOf(task.project_id) : undefined}
			projectName={showProject && !isInboxProject(task.project_id, projectMap) ? projectNames.get(task.project_id) : undefined}
				noProject={isInboxProject(task.project_id, projectMap)}
			selected={(activeList.activeId === listId && selection.selectedId === task.id) || isMultiSelected(task.id)}
			editing={editingId === task.id}
			labelPopoverOpen={labelPopoverId === task.id}
			movePopoverOpen={movePopoverId === task.id}
			onSelect={(e?: MouseEvent) => {
				activeList.setActive(listId);
				if (e && (e.ctrlKey || e.metaKey)) toggleMulti(task.id, listId);
				else if (e && e.shiftKey) rangeMulti(task.id, listId, ids);
				else {
					if (e && multiSelect.ids.length) clearMulti();
					setAnchor(task.id, listId);
				}
				selection.select(task.id);
			}}
			onStopEditing={() => (editingId = null)}
			onCloseLabelPopover={() => (labelPopoverId = null)}
			onCloseMovePopover={() => (movePopoverId = null)}
			onPick={(mode) => pick(task.id, mode)}
		/>
		</div>
		{#if extra}<div class="extra">{@render extra(task)}</div>{/if}
		</div>
	{/each}
	{#if visibleTasks.length === 0 && emptyLabel}
		<div class="empty">{emptyLabel}</div>
	{/if}
</div>

<style>
	.completed-toggle {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		padding: 2px 0;
		margin-bottom: 2px;
	}
	.completed-toggle:hover {
		color: var(--text-dim);
	}
	.completed-toggle.active {
		color: var(--text-dim);
	}
	.head {
		display: flex;
		gap: 4px;
		padding: 0 8px 4px;
		margin: 0 -8px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.head > span {
		flex-shrink: 0;
		padding: 0 8px;
	}
	.h-main {
		flex: 1 !important;
		padding: 0 !important;
		margin-right: 8px;
	}
	.h-project { width: var(--col-project); box-sizing: border-box; }
	.h-date { width: var(--col-date); box-sizing: border-box; }
	.h-link { width: var(--col-link); box-sizing: border-box; }
	.h-icon { width: var(--col-icon); padding: 0 !important; }
	.h-circle { width: 26px; padding: 0 !important; }
	.h-extra { width: var(--col-extra, 100px); padding: 0 !important; margin-left: 4px; }
	@media (max-width: 760px) {
		.head {
			display: none;
		}
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.slot {
		position: relative;
	}
	.slot.drop-before::before,
	.slot.drop-after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
		z-index: 2;
	}
	.slot.drop-before::before {
		top: -1px;
	}
	.slot.drop-after::after {
		bottom: -1px;
	}
	.with-extra {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.extra {
		flex-shrink: 0;
		width: var(--col-extra, 100px);
		display: flex;
		justify-content: flex-end;
	}
	@media (max-width: 760px) {
		.extra {
			width: auto;
		}
		/* Phones (15 Nov 2026): the line under a row runs under its buttons too. */
		.with-extra {
			border-bottom: 1px solid var(--border);
		}
		.with-extra > .grow :global(.row) {
			border-bottom-color: transparent;
		}
	}
	.empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		padding: 8px 0;
	}
</style>
