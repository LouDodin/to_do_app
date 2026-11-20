<script lang="ts">
	import Icon from './Icon.svelte';
	import { page } from '$app/state';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { inView, inferredContext } from '../utils/context';
	import { areaFilter } from '../stores/areaFilter.svelte';
	import ProjectTreeItem from './ProjectTreeItem.svelte';
	import NewProjectDialog from './NewProjectDialog.svelte';
	import { isBinProject } from '../utils/bin';
	import { compareProjects } from '../utils/projectOrder';
	import { dropProject } from '../actions/projects';
	import type { VikunjaProject } from '../types';
	import FiltersLabels from './FiltersLabels.svelte';
	import { menuFold } from '../stores/menuFold.svelte';

	const allProjects = liveState(() => db.projects.toArray(), []);
	const openTasks = liveState(() => db.tasks.filter((t) => !t.done).toArray(), []);

	let showPending = $state(false);
	let showNewProject = $state(false);
	let showArchived = $state(false);
	const archivedCount = $derived(allProjects.value.filter((p) => p.id > 0 && p.is_archived).length);

	// Open-task count per project (direct tasks only, not counting
	// sub-projects) — shown next to each project so you can see at a
	// glance which ones have work sitting in them.
	const projectById = $derived(new Map(allProjects.value.map((p) => [p.id, p])));

	// The tasks that belong to the view chosen in the top bar.
	const viewTasks = $derived(
		openTasks.value.filter((t) => areaFilter.area === 'all' || inView(t, projectById, areaFilter.area))
	);

	const counts = $derived.by(() => {
		const map = new Map<number, number>();
		for (const t of viewTasks) map.set(t.project_id, (map.get(t.project_id) ?? 0) + 1);
		return map;
	});

	// Saved filters come through the projects list as pseudo-projects with
	// negative ids (they are under Filters). Pending and archived projects are only listed when
	// asked ("Show pending", "Show archived"), and then in their place in the tree, under their
	// parent, greyed out (11 Nov 2026: archived ones used to be a separate flat list).
	const baseProjects = $derived(
		allProjects.value.filter(
			(p) =>
				p.id > 0 &&
				(showArchived || !p.is_archived) &&
				!(p.title.toLowerCase() === 'inbox' && !p.parent_project_id) &&
				!isBinProject(p) &&
				(showPending || !p.is_pending)
		)
	);

	// In Pro / Perso only the projects that belong there are listed: the ones
	// under a root named like the view, and any project holding a task whose
	// context is that view — plus their parents, so the tree stays connected.
	const visibleProjects = $derived.by(() => {
		const v = areaFilter.area;
		if (v === 'all') return baseProjects;
		const keep = new Set<number>();
		for (const p of baseProjects) if (inferredContext(p.id, projectById) === v) keep.add(p.id);
		for (const t of viewTasks) keep.add(t.project_id);
		for (const id of [...keep]) {
			let p = projectById.get(id);
			let guard = 0;
			while (p?.parent_project_id && guard++ < 20) {
				keep.add(p.parent_project_id);
				p = projectById.get(p.parent_project_id);
			}
		}
		return baseProjects.filter((p) => keep.has(p.id));
	});

	const childrenByParent = $derived.by(() => {
		const map = new Map<number | undefined, VikunjaProject[]>();
		// Vikunja sends parent_project_id: 0 (not undefined/null) for a
		// top-level project — treating 0 as "has a parent" left the tree
		// with no roots at all. A parent that isn't in the list (deleted,
		// archived) also makes the project a root rather than hiding it.
		const known = new Set(visibleProjects.map((p) => p.id));
		for (const p of visibleProjects) {
			const key = p.parent_project_id && known.has(p.parent_project_id) ? p.parent_project_id : undefined;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(p);
		}
		for (const list of map.values()) list.sort(compareProjects);
		// In All: Perso first, then Pro, then projects without a type.
		if (areaFilter.area === 'all') {
			const rank = (p: VikunjaProject) => ({ Perso: 0, Pro: 1 })[inferredContext(p.id, projectById) as 'Perso' | 'Pro'] ?? 2;
			const top = map.get(undefined);
			if (top) map.set(undefined, [...top].sort((a, b) => rank(a) - rank(b)));
		}
		return map;
	});

	const roots = $derived(childrenByParent.get(undefined) ?? []);
</script>

<!-- The menu (10 Nov 2026): every place of the app, top to bottom: the pages (Inbox, Shopping,
     Upcoming, Tomorrow, Weekly review, Bin: 13 Nov 2026; Home is the house in the top bar), then projects, filters and labels
     (each heading folds). -->
<div class="panel">
	<div class="scroll scroll-y">
		<nav class="places" aria-label="Pages">
			<a href="/inbox" class="place" class:active={page.url.pathname === '/inbox'}><span class="ic"><Icon name="inbox" size={16} /></span>Inbox</a>
			<a href="/shopping" class="place" class:active={page.url.pathname === '/shopping'}><span class="ic"><Icon name="cart" size={16} /></span>Shopping</a>
			<a href="/upcoming" class="place" class:active={page.url.pathname === '/upcoming'}><span class="ic"><Icon name="upcoming" size={16} /></span>Upcoming</a>
			<a href="/today-review" class="place" class:active={page.url.pathname === '/today-review'}><span class="ic"><Icon name="moon" size={16} /></span>Tomorrow</a>
			<a href="/weekly" class="place" class:active={page.url.pathname === '/weekly'}><span class="ic"><Icon name="calendar" size={16} /></span>Weekly review</a>
			<!-- The Bin with the pages (13 Nov 2026), no longer pinned at the bottom. -->
			<a href="/bin" class="place" class:active={page.url.pathname === '/bin'}><span class="ic"><Icon name="trash" size={16} /></span>Bin</a>
		</nav>

		<section class="block">
			<header class="block-head">
				<button class="fold" onclick={() => menuFold.toggle('projects')} aria-expanded={menuFold.isOpen('projects')}>
					<span class="caret">{menuFold.isOpen('projects') ? '▾' : '▸'}</span><h3>Projects</h3>
				</button>
				<button class="plus" onclick={() => (showNewProject = true)} aria-label="New project" title="New project">+</button>
			</header>
			{#if menuFold.isOpen('projects')}
				<div class="show">
					<span>Show</span>
					<button class="chip" class:active={showPending} aria-pressed={showPending} onclick={() => (showPending = !showPending)}>pending</button>
					<button class="chip" class:active={showArchived} aria-pressed={showArchived} onclick={() => (showArchived = !showArchived)}>archived</button>
				</div>
				<div
					class="tree"
					role="tree"
					tabindex="-1"
					ondragover={(e) => {
						if (e.dataTransfer?.types.includes('application/x-project-id')) e.preventDefault();
					}}
					ondrop={(e) => {
						// Dropped on the empty area: becomes the last top-level project.
						const id = Number(e.dataTransfer?.getData('application/x-project-id'));
						const last = roots[roots.length - 1];
						if (id && last) {
							e.preventDefault();
							void dropProject(id, last.id, 'after');
						}
					}}
				>
					{#each roots as project (project.id)}
						<ProjectTreeItem {project} {childrenByParent} {counts} />
					{/each}
					{#if showArchived && archivedCount === 0}
						<div class="none">No archived projects</div>
					{/if}
				</div>
			{/if}
		</section>

		<FiltersLabels />
	</div>
</div>

{#if showNewProject}
	<NewProjectDialog onClose={() => (showNewProject = false)} />
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		padding: 8px 8px 16px;
	}
	.places {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding-bottom: 10px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.place {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 32px;
		padding: 0 8px;
		border-radius: var(--radius);
		font-size: var(--fs-sm);
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.place:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.place.active {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 500;
	}
	.ic {
		display: grid;
		place-items: center;
		width: 18px;
		flex-shrink: 0;
		color: var(--text-faint);
	}
	.place.active .ic,
	.place:hover .ic {
		color: var(--text-dim);
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px 2px 0;
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
	.show {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 4px 18px;
		font-size: var(--fs-2xs);
		color: var(--text-faint);
	}
	.chip {
		font-size: var(--fs-2xs);
		padding: 1px 7px;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--text-faint);
	}
	.chip:hover {
		color: var(--text);
	}
	.chip.active {
		background: var(--bg-hover);
		color: var(--text);
		border-color: var(--border-strong, var(--border));
	}
	.none {
		padding: 6px 12px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.tree {
		padding: 0 0 6px;
	}
</style>
