<script lang="ts">
	import { page } from '$app/state';
	import ProjectTreeItem from './ProjectTreeItem.svelte';
	import EditProjectDialog from './EditProjectDialog.svelte';
	import { projectDrag } from '../stores/projectDrag.svelte';
	import { dropProject } from '../actions/projects';
	import { toastStore } from '../stores/toast.svelte';
	import type { VikunjaProject } from '../types';
	import { moveTaskToProject } from '../actions/tasks';
	import { clearMulti } from '../stores/multiSelect.svelte';

	let {
		project,
		childrenByParent,
		counts,
		depth = 0
	}: {
		project: VikunjaProject;
		childrenByParent: Map<number | undefined, VikunjaProject[]>;
		counts?: Map<number, number>;
		depth?: number;
	} = $props();

	const kids = $derived(childrenByParent.get(project.id) ?? []);
	let collapsed = $state(false);
	const isActive = $derived(page.url.pathname === `/project/${project.id}`);

	// Right-click a project to rename it or move it under a different
	// parent, without leaving the panel.
	let showEdit = $state(false);

	// Drag and drop: top quarter = before, bottom quarter = after, middle = inside (sub-project).
	let dropWhere = $state<'before' | 'after' | 'inside' | null>(null);
	function inSubtree(rootId: number, id: number): boolean {
		if (rootId === id) return true;
		return (childrenByParent.get(rootId) ?? []).some((k) => inSubtree(k.id, id));
	}
	function whereFor(e: DragEvent): 'before' | 'after' | 'inside' {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (e.clientY - r.top) / r.height;
		return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
	}
	// A task dragged from a list onto a project (19 Nov 2026, Lou: from the Inbox on a computer,
	// move a task straight into its project; from the Inbox page it is validated at the same time).
	const isTaskDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes('application/x-task-id');
	async function dropTasks(e: DragEvent) {
		const many = e.dataTransfer?.getData('application/x-task-ids');
		const one = Number(e.dataTransfer?.getData('application/x-task-id'));
		const ids: number[] = many ? JSON.parse(many) : one ? [one] : [];
		if (!ids.length) return;
		const fromInbox = page.url.pathname === '/inbox';
		for (const id of ids) await moveTaskToProject(id, project.id);
		if (ids.length > 1) clearMulti();
		toastStore.success(`${ids.length > 1 ? `${ids.length} tasks` : 'Task'} moved to ${project.title}${fromInbox ? ' and validated' : ''}`);
	}
	function canDrop(e: DragEvent): boolean {
		return (
			!!e.dataTransfer?.types.includes('application/x-project-id') &&
			projectDrag.id !== null &&
			!inSubtree(projectDrag.id, project.id)
		);
	}
</script>

<div
	class="item"
	class:drop-before={dropWhere === 'before'}
	class:drop-after={dropWhere === 'after'}
	class:drop-first={dropWhere === 'after' && !collapsed && kids.length > 0}
	class:drop-inside={dropWhere === 'inside'}
	class:dragging={projectDrag.id === project.id}
	style="padding-left: {depth * 14}px"
	role="treeitem"
	aria-selected={isActive}
	tabindex="-1"
	draggable="true"
	ondragstart={(e) => {
		e.dataTransfer?.setData('application/x-project-id', String(project.id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		projectDrag.id = project.id;
	}}
	ondragend={() => {
		projectDrag.id = null;
		dropWhere = null;
	}}
	ondragover={(e) => {
		if (isTaskDrag(e) && !project.is_archived) {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			dropWhere = 'inside';
			return;
		}
		if (!canDrop(e)) return e.stopPropagation(); // not allowed here: also not on the panel background
		e.preventDefault();
		e.stopPropagation();
		dropWhere = whereFor(e);
	}}
	ondragleave={() => (dropWhere = null)}
	ondrop={async (e) => {
		if (isTaskDrag(e)) {
			e.preventDefault();
			e.stopPropagation();
			dropWhere = null;
			if (!project.is_archived) await dropTasks(e);
			return;
		}
		if (!canDrop(e)) return e.stopPropagation();
		e.preventDefault();
		e.stopPropagation();
		const where = whereFor(e);
		const id = projectDrag.id!;
		dropWhere = null;
		projectDrag.id = null;
		if (where === 'inside') collapsed = false;
		// Just under an open project with sub-projects, the line shows above its first sub-project:
		// the project goes there, as its first sub-project (5 Nov 2026: "impossible to move a
		// subproject in first"; it went after the whole parent instead).
		const first = where === 'after' && !collapsed ? kids.find((k) => k.id !== id) : undefined;
		const ok = first ? await dropProject(id, first.id, 'before') : await dropProject(id, project.id, where);
		if (!ok) toastStore.error('A project cannot be moved into itself.');
	}}
>
	{#if kids.length > 0}
		<button class="chevron" onclick={() => (collapsed = !collapsed)} aria-label="Expand/collapse">
			{collapsed ? '▸' : '▾'}
		</button>
	{:else}
		<span class="chevron-spacer"></span>
	{/if}
	<a
		href="/project/{project.id}"
		draggable="false"
		class="link"
		class:active={isActive}
		oncontextmenu={(e) => {
			e.preventDefault();
			showEdit = true;
		}}
	>
		<span class="title" class:dim={project.is_archived}>{project.title}</span>
		{#if project.is_archived}<span class="badge">archived</span>{:else if project.is_pending}<span class="badge">pending</span>{/if}
	</a>
</div>

{#if showEdit}
	<EditProjectDialog {project} onClose={() => (showEdit = false)} />
{/if}

{#if !collapsed}
	{#each kids as kid (kid.id)}
		<ProjectTreeItem project={kid} {childrenByParent} {counts} depth={depth + 1} />
	{/each}
{/if}

<style>
	.item {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.item {
		position: relative;
	}
	.item.dragging {
		opacity: 0.4;
	}
	.item.drop-before::before,
	.item.drop-after::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 4px;
		height: 2px;
		background: var(--accent);
		border-radius: 2px;
		pointer-events: none;
	}
	.item.drop-before::before {
		top: -1px;
	}
	.item.drop-after::after {
		bottom: -1px;
	}
	.item.drop-first::after {
		left: 22px; /* as the first sub-project */
	}
	.item.drop-inside {
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		border-radius: var(--radius);
	}
	.chevron,
	.chevron-spacer {
		width: 24px;
		height: 28px;
		flex-shrink: 0;
		font-size: var(--fs-md);
		color: var(--text-faint);
		text-align: center;
	}
	.chevron {
		border-radius: var(--radius);
	}
	.chevron:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-sm);
		height: 30px;
		padding: 0 8px;
		border-radius: var(--radius);
		color: var(--text-dim);
	}
	.link:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.link.active {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 500;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dim {
		opacity: 0.6;
	}
	.badge {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		background: var(--bg-elevated);
		border-radius: 999px;
		padding: 0 6px;
		flex-shrink: 0;
	}
	.count {
		margin-left: auto;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		flex-shrink: 0;
	}
</style>
