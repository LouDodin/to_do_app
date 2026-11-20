<script lang="ts">
	import Icon from '../../../lib/components/Icon.svelte';
	// Project page: the tasks with no section at the top, then the sections. Redone 13 Nov 2026
	// (Lou and Lou Canava): plain and compact. The title line holds + (a new task, set up in a
	// window) and ⋯ (order, completed and pending tasks shown or not, pending project, archive).
	// Each section: drag it by its title bar (mouse) or its handle ⠿ (finger), fold it, + adds a
	// task to it, ⋯ holds Move up / Move down / Delete. Pending tasks are hidden unless shown.
	import { page } from '$app/state';
	import { db } from '../../../lib/db/schema';
	import { liveState } from '../../../lib/db/live.svelte';
	import { createSection, renameSection, deleteSection, reorderSections } from '../../../lib/actions/sections';
	import { recorded } from '../../../lib/stores/history.svelte';
	import { pageSections, draggedIds } from '../../../lib/stores/multiSelect.svelte';
	import type { VikunjaTask } from '../../../lib/types';
	import { moveTaskToSection, moveTaskToProject } from '../../../lib/actions/tasks';
	import { setProjectPending, renameProject, archiveIfFinished, archiveProject } from '../../../lib/actions/projects';
	import TaskList from '../../../lib/components/TaskList.svelte';
	import { olderFirst } from '../../../lib/utils/order';
	import { toastStore } from '../../../lib/stores/toast.svelte';
	import { clickOutside } from '../../../lib/actions/clickOutside';
	import { isTaskPending } from '../../../lib/utils/context';
	import NewTaskDialog from '../../../lib/components/NewTaskDialog.svelte';

	const projectId = $derived(Number(page.params.id));
	const project = liveState(() => db.projects.get(projectId), undefined);
	const allProjects = liveState(() => db.projects.toArray(), []);
	// Order (5 Nov 2026): oldest first (a task added here goes to the bottom and stays there), newest
	// first, or your own order (drag a task onto another). Remembered on this device.
	type Order = 'oldest' | 'newest' | 'manual';
	function readOrder(): Order {
		try {
			const v = localStorage.getItem('project_order');
			return v === 'newest' || v === 'manual' ? v : 'oldest';
		} catch {
			return 'oldest';
		}
	}
	let order = $state<Order>(readOrder());
	function setOrder(o: Order) {
		order = o;
		try {
			localStorage.setItem('project_order', o);
		} catch {
			// not remembered
		}
	}
	const ORDER_LABEL: Record<Order, string> = { oldest: 'Oldest first ↑', newest: 'Newest first ↓', manual: 'My order ⇅' };
	const NEXT: Record<Order, Order> = { oldest: 'newest', newest: 'manual', manual: 'oldest' };
	function byOrder(a: VikunjaTask, b: VikunjaTask): number {
		if (order === 'newest') return olderFirst(b, a);
		if (order === 'manual') return (a.local_order ?? Infinity) - (b.local_order ?? Infinity) || olderFirst(a, b);
		return olderFirst(a, b);
	}
	const rawTasks = liveState(() => db.tasks.where('project_id').equals(projectId).toArray(), []);
	// Shown or not, remembered on this device: completed tasks, pending (on hold) tasks.
	function readFlag(key: string): boolean {
		try {
			return localStorage.getItem(key) === '1';
		} catch {
			return false;
		}
	}
	function writeFlag(key: string, on: boolean) {
		try {
			localStorage.setItem(key, on ? '1' : '0');
		} catch {
			// not remembered
		}
	}
	let showDone = $state(readFlag('project_show_done'));
	let showPending = $state(readFlag('project_show_pending'));
	const allTasks = $derived({ value: rawTasks.value.filter((t) => showPending || t.done || !isTaskPending(t)).sort(byOrder) });
	let pageMenu = $state(false);
	let newTaskIn = $state<number | null | undefined>(undefined);

	// Parent chain (root → ... → this project's parent), so you can see
	// where you are in the tree and jump back up a level, per usual app
	// conventions for nested folders/projects.
	const breadcrumb = $derived.by(() => {
		const chain: { id: number; title: string }[] = [];
		let current = project.value;
		const byId = new Map(allProjects.value.map((p) => [p.id, p]));
		while (current?.parent_project_id) {
			const parent = byId.get(current.parent_project_id);
			if (!parent) break;
			chain.unshift({ id: parent.id, title: parent.title });
			current = parent;
		}
		return chain;
	});
	const sections = liveState(
		() => db.sections.where('project_id').equals(projectId).sortBy('position'),
		[]
	);
	// The bar for several selected tasks offers these sections.
	$effect(() => {
		pageSections.projectId = projectId;
		pageSections.list = sections.value.map((x) => ({ id: x.id, title: x.title }));
	});
	function moveSection(id: number, dir: -1 | 1) {
		const ids = sections.value.map((x) => x.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		reorderSections(projectId, ids);
	}

	// Drag a task onto another one: it goes just before or after it, in that block (5 Nov 2026).
	async function dropOnTask(ids: number[], targetId: number, after: boolean, sectionId: number | null) {
		const block = (sectionId === null ? unassigned : bySection.get(sectionId) ?? []).filter((t) => !ids.includes(t.id)).map((t) => t.id);
		let at = block.indexOf(targetId);
		if (at < 0) at = block.length;
		else if (after) at++;
		const ordered = [...block.slice(0, at), ...ids, ...block.slice(at)];
		await recorded(ids.length > 1 ? `Reorder ${ids.length} tasks` : 'Reorder', ordered, async () => {
			for (let i = 0; i < ordered.length; i++) {
				const t = await db.tasks.get(ordered[i]);
				if (!t) continue;
				if (t.project_id !== projectId) await moveTaskToProject(t.id, projectId);
				await db.tasks.update(t.id, { local_order: i, section_id: sectionId });
			}
		});
		if (order !== 'manual') setOrder('manual');
	}

	const unassigned = $derived(allTasks.value.filter((t) => !t.section_id));
	const bySection = $derived.by(() => {
		const map = new Map<number, typeof allTasks.value>();
		for (const s of sections.value) map.set(s.id, []);
		for (const t of allTasks.value) {
			if (t.section_id && map.has(t.section_id)) map.get(t.section_id)!.push(t);
		}
		return map;
	});

	// Drag a task onto a section (or the untitled top block) to move it.
	// `null` = the top block, i.e. no section. dropTarget highlights the
	// block currently under the pointer.
	let dropTarget = $state<number | null | undefined>(undefined);
	function dragOver(e: DragEvent, target: number | null) {
		if (!e.dataTransfer?.types.includes('application/x-task-id')) return;
		e.preventDefault();
		dropTarget = target;
	}
	function drop(e: DragEvent, target: number | null) {
		const ids = draggedIds(e);
		dropTarget = undefined;
		if (!ids.length) return;
		e.preventDefault();
		void recorded(ids.length > 1 ? `Move ${ids.length} tasks to a section` : 'Move to a section', ids, async () => {
			for (const id of ids) {
				const t = await db.tasks.get(id);
				if (t && t.project_id !== projectId) await moveTaskToProject(id, projectId);
				await moveTaskToSection(id, target);
			}
		});
	}

	let titleDraft = $state('');
	$effect(() => {
		if (project.value) titleDraft = project.value.title;
	});

	// Sub-projects (10 Nov 2026): a parent project also lists the projects under it, each with its
	// tasks, so the whole tree can be seen in one place. Can be hidden; remembered on this device.
	const subProjects = $derived.by(() => {
		const kids = new Map<number, typeof allProjects.value>();
		for (const p of allProjects.value) {
			// Only open sub-projects: not archived, not pending (13 Nov 2026).
			if (!p.parent_project_id || p.is_archived || p.is_pending) continue;
			const list = kids.get(p.parent_project_id) ?? [];
			list.push(p);
			kids.set(p.parent_project_id, list);
		}
		const out: { id: number; title: string; depth: number; path: string }[] = [];
		const walk = (id: number, depth: number, path: string) => {
			for (const c of (kids.get(id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))) {
				if (out.length > 200) return;
				out.push({ id: c.id, title: c.title, depth, path: path ? `${path} / ${c.title}` : c.title });
				walk(c.id, depth + 1, path ? `${path} / ${c.title}` : c.title);
			}
		};
		walk(projectId, 0, '');
		return out;
	});
	const subIds = $derived(subProjects.map((p) => p.id));
	const subTasks = liveState(async () => {
		const ids = subIds;
		return ids.length ? db.tasks.where('project_id').anyOf(ids).toArray() : [];
	}, []);
	const subTasksBy = $derived.by(() => {
		const m = new Map<number, VikunjaTask[]>();
		for (const t of [...subTasks.value].sort(olderFirst)) {
			const l = m.get(t.project_id) ?? [];
			l.push(t);
			m.set(t.project_id, l);
		}
		return m;
	});
	function readShowSubs(): boolean {
		try {
			return localStorage.getItem('project_show_subs') !== '0';
		} catch {
			return true;
		}
	}
	let showSubs = $state(readShowSubs());
	function toggleSubs() {
		showSubs = !showSubs;
		try {
			localStorage.setItem('project_show_subs', showSubs ? '1' : '0');
		} catch {
			// not remembered
		}
	}

	// Folded sections, remembered on this device.
	function readFolded(): number[] {
		try {
			return JSON.parse(localStorage.getItem('project_folded_sections') ?? '[]');
		} catch {
			return [];
		}
	}
	let folded = $state<number[]>(readFolded());
	function toggleFold(id: number) {
		folded = folded.includes(id) ? folded.filter((x) => x !== id) : [...folded, id];
		try {
			localStorage.setItem('project_folded_sections', JSON.stringify(folded));
		} catch {
			// not remembered
		}
	}

	// Drag and drop a section (pointer events: mouse, pen and touch alike). With the mouse, grab the
	// section's title bar anywhere (a simple click still edits the title); with a finger, the handle
	// ⠿ (so that swiping over a title still scrolls the page). While dragging, a line shows where it
	// will go: before the section whose title bar is below the pointer.
	let dragSection = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);
	function sectionDragStart(e: PointerEvent, id: number) {
		if (e.button !== 0) return;
		const t = e.target as HTMLElement;
		const onGrip = !!t.closest('.grip');
		if (!onGrip && (e.pointerType !== 'mouse' || t.closest('button, [contenteditable]:focus'))) return;
		const handle = e.currentTarget as HTMLElement;
		const y0 = e.clientY;
		let started = false;
		const begin = () => {
			started = true;
			(document.activeElement as HTMLElement | null)?.blur?.();
			window.getSelection()?.removeAllRanges();
			dragSection = id;
			dropIndex = null;
		};
		// On a title not being edited, the press neither focuses it nor selects text: a click
		// without moving then places the caret where it was clicked (below, in end()).
		const title = !onGrip && t.closest('h2') ? (t.closest('h2') as HTMLElement) : null;
		if (title) e.preventDefault();
		if (onGrip) {
			e.preventDefault();
			handle.setPointerCapture(e.pointerId);
			begin();
		}
		const move = (ev: PointerEvent) => {
			if (!started) {
				if (Math.abs(ev.clientY - y0) < 6) return;
				handle.setPointerCapture(e.pointerId);
				begin();
			}
			ev.preventDefault();
			const heads = [...document.querySelectorAll<HTMLElement>('.project-page .section-header')];
			let idx = heads.length;
			for (let k = 0; k < heads.length; k++) {
				const r = heads[k].getBoundingClientRect();
				if (ev.clientY < r.top + r.height / 2) {
					idx = k;
					break;
				}
			}
			dropIndex = idx;
			if (ev.clientY < 60) window.scrollBy(0, -12);
			else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
		};
		const end = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', end);
			if (!started) {
				if (title && ev.type === 'pointerup') {
					title.focus();
					const r = document.caretRangeFromPoint?.(ev.clientX, ev.clientY);
					if (r) {
						const sel = window.getSelection();
						sel?.removeAllRanges();
						sel?.addRange(r);
					}
				}
				return;
			}
			const ids = sections.value.map((x) => x.id);
			const from = ids.indexOf(id);
			let to = dropIndex;
			dragSection = null;
			dropIndex = null;
			if (ev.type === 'pointercancel' || to === null || from < 0) return;
			if (to > from) to--;
			if (to === from) return;
			ids.splice(from, 1);
			ids.splice(to, 0, id);
			reorderSections(projectId, ids);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', end);
	}
	let menuFor = $state<number | null>(null);

	let newSectionTitle = $state('');
	async function addSection() {
		if (!newSectionTitle.trim()) return;
		await createSection(projectId, newSectionTitle.trim());
		newSectionTitle = '';
	}
</script>

<svelte:head>
	<title>{project.value ? `${project.value.title} — Tasks` : 'Tasks'}</title>
</svelte:head>

{#if project.value}
	<div class="project-page page">
		{#if breadcrumb.length > 0}
			<nav class="breadcrumb">
				{#each breadcrumb as crumb (crumb.id)}
					<a href="/project/{crumb.id}">{crumb.title}</a>
					<span class="sep">/</span>
				{/each}
				<span class="current">{project.value.title}</span>
			</nav>
		{/if}
		<div class="header">
			<input
				class="title"
				aria-label="Project name"
				bind:value={titleDraft}
				onblur={() => titleDraft.trim() && titleDraft !== project.value!.title && renameProject(projectId, titleDraft.trim())}
			/>
			<button class="btn-icon add" onclick={() => (newTaskIn = null)} aria-label="New task in this project" title="New task"><Icon name="plus" size={18} /></button>
			<!-- Computer (13 Nov 2026): every option in view, no ⋯. -->
			<div class="tools">
				<select class="tool" aria-label="Order" value={order} onchange={(e) => setOrder((e.target as HTMLSelectElement).value as Order)}>
					<option value="oldest">Oldest first</option>
					<option value="newest">Newest first</option>
					<option value="manual">My order</option>
				</select>
				<button class="tool" class:on={showDone} aria-pressed={showDone} onclick={() => { showDone = !showDone; writeFlag('project_show_done', showDone); }} title={showDone ? 'Hide completed' : 'Show completed'}>Completed</button>
				<button class="tool" class:on={showPending} aria-pressed={showPending} onclick={() => { showPending = !showPending; writeFlag('project_show_pending', showPending); }} title={showPending ? 'Hide pending tasks' : 'Show pending tasks'}>Pending</button>
				<span class="sep"></span>
				<button class="tool" class:on={project.value.is_pending} onclick={() => setProjectPending(projectId, !project.value!.is_pending)}>{project.value.is_pending ? 'Unmark pending' : 'Mark pending'}</button>
				{#if project.value.is_archived}
					<button class="tool" onclick={async () => { await archiveProject(projectId, false); toastStore.success('Restored from the archive'); }}>Restore</button>
				{:else}
					<button class="tool" onclick={async () => { const r = await archiveIfFinished(projectId); if (r.ok) toastStore.success(r.message); else toastStore.error(r.message); }}>Archive</button>
				{/if}
			</div>
			<span class="menu-wrap phone-only" use:clickOutside={() => (pageMenu = false)}>
				<button class="btn-icon more" onclick={() => (pageMenu = !pageMenu)} aria-label="Project actions" aria-expanded={pageMenu}>⋯</button>
				{#if pageMenu}
					<div class="menu wide">
						<div class="menu-label">Order</div>
						{#each ['oldest', 'newest', 'manual'] as const as o (o)}
							<button class="radio" aria-pressed={order === o} onclick={() => { setOrder(o); pageMenu = false; }}>{order === o ? '●' : '○'} {o === 'oldest' ? 'Oldest first' : o === 'newest' ? 'Newest first' : 'My order'}</button>
						{/each}
						<hr />
						<button aria-pressed={showDone} onclick={() => { showDone = !showDone; writeFlag('project_show_done', showDone); pageMenu = false; }}>{showDone ? 'Hide completed' : 'Show completed'}</button>
						<button aria-pressed={showPending} onclick={() => { showPending = !showPending; writeFlag('project_show_pending', showPending); pageMenu = false; }}>{showPending ? 'Hide pending tasks' : 'Show pending tasks'}</button>
						<hr />
						<button onclick={() => { pageMenu = false; setProjectPending(projectId, !project.value!.is_pending); }}>{project.value.is_pending ? 'Unmark pending' : 'Mark pending'}</button>
						{#if project.value.is_archived}
							<button onclick={async () => { pageMenu = false; await archiveProject(projectId, false); toastStore.success('Restored from the archive'); }}>Restore</button>
						{:else}
							<button onclick={async () => { pageMenu = false; const r = await archiveIfFinished(projectId); if (r.ok) toastStore.success(r.message); else toastStore.error(r.message); }}>Archive</button>
						{/if}
					</div>
				{/if}
			</span>
		</div>
		{#if project.value.is_pending || project.value.is_archived}
			<p class="meta">{[project.value.is_pending ? 'pending project' : '', project.value.is_archived ? 'archived' : ''].filter(Boolean).join(' · ')}</p>
		{/if}

		<!-- The first block has no title: it simply holds tasks that aren't in
		     a named section. -->
		<section
			role="group"
			class:drop-target={dropTarget === null}
			ondragover={(e) => dragOver(e, null)}
			ondragleave={() => dropTarget === null && (dropTarget = undefined)}
			ondrop={(e) => drop(e, null)}
		>
			<TaskList tasks={unassigned} completed={showDone ? 'show' : 'hide'} columnHeads={false} showProject={false} emptyLabel={sections.value.length ? '' : 'No tasks'} onDropOnTask={(ids, t, after) => dropOnTask(ids, t, after, null)} />
		</section>

		{#each sections.value as s, i (s.id)}
			{@const list = bySection.get(s.id) ?? []}
			{@const isFolded = folded.includes(s.id)}
			<section
				role="group"
				class="sec"
				class:drop-target={dropTarget === s.id}
				class:dragging={dragSection === s.id}
				class:drop-before={dragSection !== null && dropIndex === i}
				class:drop-after={dragSection !== null && dropIndex === sections.value.length && i === sections.value.length - 1}
				ondragover={(e) => dragOver(e, s.id)}
				ondragleave={() => dropTarget === s.id && (dropTarget = undefined)}
				ondrop={(e) => drop(e, s.id)}
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="section-header" onpointerdown={(e) => sectionDragStart(e, s.id)}>
					<button class="grip" aria-label="Drag to move the section" title="Drag to move">
						<svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" /></g></svg>
					</button>
					<button class="fold" onclick={() => toggleFold(s.id)} aria-expanded={!isFolded} aria-label={isFolded ? 'Unfold the section' : 'Fold the section'}>
						<span class="chev" class:shut={isFolded} aria-hidden="true">›</span>
					</button>
					<h2 contenteditable="true" onblur={(e) => renameSection(s.id, (e.target as HTMLElement).textContent ?? s.title)} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLElement).blur())}>
						{s.title}
					</h2>
					<span class="count"></span>
					<button class="btn-icon add small" onclick={() => (newTaskIn = s.id)} aria-label="New task in {s.title}" title="New task in this section"><Icon name="plus" size={15} /></button>
					<span class="menu-wrap" use:clickOutside={() => menuFor === s.id && (menuFor = null)}>
						<button class="btn-icon more" onclick={() => (menuFor = menuFor === s.id ? null : s.id)} aria-label="Section actions" aria-expanded={menuFor === s.id}>⋯</button>
						{#if menuFor === s.id}
							<div class="menu">
								<button onclick={() => { menuFor = null; moveSection(s.id, -1); }} disabled={i === 0} aria-label="Move the section up">↑ Move up</button>
								<button onclick={() => { menuFor = null; moveSection(s.id, 1); }} disabled={i === sections.value.length - 1} aria-label="Move the section down">↓ Move down</button>
								<button class="danger" onclick={() => { menuFor = null; if (confirm('Delete this section? Its tasks stay in the project.')) deleteSection(s.id); }} aria-label="Delete the section"><Icon name="trash" size={14} /> Delete</button>
							</div>
						{/if}
					</span>
				</div>
				{#if !isFolded}
					<TaskList tasks={list} completed={showDone ? 'show' : 'hide'} columnHeads={false} showProject={false} emptyLabel="" onDropOnTask={(ids, t, after) => dropOnTask(ids, t, after, s.id)} />
				{/if}
			</section>
		{/each}

		<div class="new-section">
			<Icon name="plus" size={15} />
			<input type="text" placeholder="New section…" bind:value={newSectionTitle} onkeydown={(e) => e.key === 'Enter' && addSection()} />
			{#if newSectionTitle.trim()}<button class="btn small" onclick={addSection}>Add section</button>{/if}
		</div>

		{#if newTaskIn !== undefined}
			<NewTaskDialog {projectId} sectionId={newTaskIn} onClose={() => (newTaskIn = undefined)} />
		{/if}

		{#if subProjects.length}
			<div class="subs">
				<button class="subs-toggle" onclick={toggleSubs} aria-expanded={showSubs}>
					{showSubs ? '▾' : '▸'} Sub-projects ({subProjects.length})
				</button>
				{#if showSubs}
					{#each subProjects as sp (sp.id)}
						{@const list = subTasksBy.get(sp.id) ?? []}
						<section class="sub" style:margin-left="{Math.min(sp.depth, 4) * 16}px">
							<h2 class="sub-title">
								<a href="/project/{sp.id}" title={sp.path}>{sp.title}</a>
								
							</h2>
							<TaskList tasks={list.filter((t) => showPending || t.done || !isTaskPending(t))} showProject={false} columnHeads={false} completed={showDone ? 'show' : 'hide'} emptyLabel="No open tasks" />
						</section>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<div class="not-found">Project not found.</div>
{/if}

<style>
	.subs {
		margin-top: 20px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}
	.subs-toggle {
		font-size: var(--fs-sm);
		color: var(--text-dim);
		font-weight: 600;
		padding: 4px 0;
	}
	.subs-toggle:hover {
		color: var(--text);
	}
	.sub {
		margin-top: 14px;
	}
	.sub-title {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: var(--fs-md, 1rem);
		margin: 0 0 4px;
	}
	.sub-title a:hover {
		text-decoration: underline;
	}
	.breadcrumb {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		margin-bottom: 8px;
	}
	.breadcrumb a:hover {
		color: var(--text);
		text-decoration: underline;
	}
	.breadcrumb .sep {
		color: var(--text-faint);
	}
	.breadcrumb .current {
		color: var(--text-dim);
	}
	.header {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
	}
	.tool {
		height: 28px;
		padding: 0 9px;
		border-radius: 999px;
		font-size: var(--fs-xs);
		color: var(--text-dim);
		background: transparent;
		border: 1px solid transparent;
	}
	select.tool {
		border-color: var(--border);
		padding-right: 4px;
	}
	.tool:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.tool.on {
		background: var(--bg-elevated);
		color: var(--text);
		border-color: var(--border-strong);
	}
	.sep {
		width: 1px;
		height: 16px;
		background: var(--border-strong);
		margin: 0 6px;
	}
	.phone-only {
		display: none;
	}
	@media (max-width: 900px) {
		.tools {
			display: none;
		}
		.phone-only {
			display: inline-block;
		}
	}
	.meta {
		margin: 0 0 6px;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.meta b {
		color: var(--text-dim);
		font-weight: 600;
	}
	.add {
		color: var(--text-dim);
	}
	.add.small {
		width: 26px;
		height: 26px;
		color: var(--text-faint);
		opacity: 0.6;
	}
	.section-header:hover .add.small,
	.add.small:focus-visible {
		opacity: 1;
	}
	.menu.wide {
		min-width: 200px;
	}
	.menu-label {
		padding: 4px 8px 2px;
		font-size: var(--fs-2xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}
	.menu hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 4px 2px;
	}
	.menu .radio[aria-pressed='true'] {
		font-weight: 600;
	}
	.title {
		font-family: var(--font-dots, inherit);
		font-size: var(--fs-xl);
		font-weight: 600;
		letter-spacing: -0.01em;
		border: none;
		background: none;
		flex: 1;
		/* without it, the box keeps its natural width and pushed + and ⋯ off a phone's screen (the
		   "Mark pending / Archive on the phone" bug, 13 Nov 2026) */
		min-width: 0;
		text-overflow: ellipsis;
		height: auto;
		padding: 0;
		border-radius: 0;
	}
	.title:focus {
		outline: none;
		border: none;
	}
	section {
		margin-bottom: 4px;
	}
	.sec {
		margin-top: 14px;
		position: relative;
	}
	.sec.dragging {
		opacity: 0.45;
	}
	.sec.dragging .section-header,
	.sec.dragging h2 {
		cursor: grabbing;
		user-select: none;
	}
	@media (hover: hover) {
		.section-header {
			cursor: grab;
		}
		.section-header h2 {
			cursor: text;
		}
	}
	.sec.drop-before::before,
	.sec.drop-after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 2px;
		background: var(--accent);
	}
	.sec.drop-before::before {
		top: -9px;
	}
	.sec.drop-after::after {
		bottom: -9px;
	}
	.section-header {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 30px;
		margin-left: -26px;
		margin-bottom: 2px;
		border-bottom: 1px solid var(--border);
	}
	.grip {
		width: 22px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		/* Shown when the pointer is over the section's title bar (13 Nov 2026), like the tick boxes. */
		opacity: 0;
		cursor: grab;
		touch-action: none;
		padding: 0;
	}
	.section-header:hover .grip,
	.grip:focus-visible,
	.sec.dragging .grip {
		opacity: 1;
	}
	/* No pointer to hover with (touch screens): the handle stays visible, faintly. */
	@media (hover: none) {
		.grip {
			opacity: 0.6;
		}
	}
	.grip:active {
		cursor: grabbing;
	}
	.fold {
		width: 22px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		padding: 0;
	}
	.chev {
		display: inline-block;
		transform: rotate(90deg);
		transition: transform 0.12s;
		font-size: 15px;
	}
	.chev.shut {
		transform: none;
	}
	h2 {
		font-size: var(--fs-sm);
		font-weight: 700;
		color: var(--text);
		margin: 0;
		padding: 2px 4px;
		border-radius: 4px;
		outline: none;
	}
	h2:focus {
		background: var(--bg-elevated);
	}
	.count {
		flex: 1;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		padding-left: 4px;
	}
	.menu-wrap {
		position: relative;
	}
	.more {
		color: var(--text-faint);
		font-size: 16px;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 30;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		padding: 4px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-sm);
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 6px;
		text-align: left;
		padding: 6px 8px;
		border-radius: 6px;
	}
	.menu button:hover:not(:disabled) {
		background: var(--bg-hover);
	}
	.menu button:disabled {
		opacity: 0.35;
	}
	.menu .danger {
		color: var(--danger, #dc2626);
	}
	@media (max-width: 760px) {
		.section-header {
			margin-left: 0;
		}
		.grip {
			opacity: 0.6;
		}
	}
	section.drop-target {
		outline: 2px dashed var(--accent);
		outline-offset: 4px;
		border-radius: var(--radius);
	}
	.new-section {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		padding: 2px 8px;
		color: var(--text-faint);
		border-radius: var(--radius);
	}
	.new-section:focus-within {
		background: var(--bg-elevated);
	}
	.new-section input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		font: inherit;
		font-size: var(--fs-sm, 14px);
		color: var(--text);
		padding: 6px 0;
		outline: none;
	}
	.btn.small {
		padding: 3px 10px;
		font-size: var(--fs-xs);
	}
	.not-found {
		padding: 40px;
		text-align: center;
		color: var(--text-faint);
	}
</style>
