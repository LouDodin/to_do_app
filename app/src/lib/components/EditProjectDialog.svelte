<script lang="ts">
	// Opened via right-click on a project in the left-panel tree — lets you
	// rename it and move it under a different parent (or to top level).
	import Modal from './Modal.svelte';
	import InlineProjectPicker from './InlineProjectPicker.svelte';
	import { renameProject, moveProject, setProjectPending, deleteProject, setProjectType, archiveProject, archiveIfFinished } from '../actions/projects';
	import { deleteProjectTree } from '../actions/maintenance';
	import { toastStore } from '../stores/toast.svelte';
	import { inferredContext, projectOwnType, typeSource, CONTEXTS, isInboxProject, type Context } from '../utils/context';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { descendantProjectIds } from '../db/queries';
	import type { VikunjaProject } from '../types';

	let { project, onClose }: { project: VikunjaProject; onClose: () => void } = $props();

	const allProjects = liveState(() => db.projects.toArray(), []);
	const currentParent = $derived(
		project.parent_project_id ? (allProjects.value.find((p) => p.id === project.parent_project_id) ?? null) : null
	);
	// Can't move a project inside itself or one of its own descendants.
	const excludeIds = liveState(async () => [...(await descendantProjectIds(project.id))], [project.id] as number[]);

	let title = $state(project.title);
	let parent = $state<VikunjaProject | null>(null);
	let parentInitialised = $state(false);
	let isPending = $state(project.is_pending ?? false);

	// Seed the parent picker once the project list is loaded, without
	// clobbering a choice the user has already made.
	$effect(() => {
		if (!parentInitialised && allProjects.value.length > 0) {
			parent = currentParent;
			parentInitialised = true;
		}
	});

	// Context (Pro / Perso) is a setting of the project, applied to everything under it.
	const byId = $derived(new Map(allProjects.value.map((p) => [p.id, p])));
	const isInbox = $derived(isInboxProject(project.id, byId));
	// A higher project that already has a context decides for this one.
	const inheritedFrom = $derived(
		project.parent_project_id ? typeSource(project.parent_project_id, byId) : null
	);
	let typeChoice = $state<Context | null>(projectOwnType(project) ?? inferredContext(project.id, new Map([[project.id, project]])));

	// No Save button: whatever is set when the window closes is what counts.
	let gone = false;
	async function close() {
		if (!gone) await commit();
		onClose();
	}
	async function commit() {
		if (!title.trim()) return;
		if (title.trim() !== project.title) await renameProject(project.id, title.trim());
		if ((parent?.id ?? undefined) !== project.parent_project_id) {
			await moveProject(project.id, parent?.id);
		}
		if (!isInbox && !inheritedFrom && typeChoice !== projectOwnType(project)) await setProjectType(project.id, typeChoice);
		if (isPending !== (project.is_pending ?? false)) await setProjectPending(project.id, isPending);
	}

	let busy = $state(false);
	async function remove() {
		if (!confirm(`Delete "${project.title}" and its sub-projects? Open tasks go back to the Inbox, completed tasks go to the Bin for 30 days.`)) return;
		busy = true;
		const r = await deleteProjectTree(project.id);
		busy = false;
		if (r.ok) toastStore.success(r.message);
		else toastStore.error(r.message);
		if (r.ok) {
			gone = true;
			onClose();
		}
	}

	async function archive() {
		const r = await archiveIfFinished(project.id);
		if (!r.ok) return toastStore.error(r.message);
		toastStore.success(r.message);
		gone = true;
		onClose();
	}
	async function restore() {
		await archiveProject(project.id, false);
		toastStore.success(`"${project.title}" restored`);
		gone = true;
		onClose();
	}
</script>

<Modal title="Edit project" onClose={close}>
	<input
		type="text"
		placeholder="Project name"
		bind:value={title}
		onkeydown={(e) => e.key === 'Enter' && close()}
	/>
	{#if !isInbox}
		<div>
			<div class="label">Context</div>
			{#if inheritedFrom}
				<div class="hint">From “{inheritedFrom.title}”</div>
			{:else}
				<div class="seg" role="group" aria-label="Context">
					{#each CONTEXTS as c (c)}
						<button type="button" class:on={typeChoice === c} onclick={() => (typeChoice = c)}>{c}</button>
					{/each}
					<button type="button" class:on={typeChoice === null} onclick={() => (typeChoice = null)}>None</button>
				</div>
			{/if}
		</div>
	{/if}
	<div>
		<div class="label">Parent project</div>
		<InlineProjectPicker
			selected={parent}
			onChange={(p) => (parent = p)}
			placeholder="None (top level)"
			excludeIds={excludeIds.value}
		/>
	</div>
	<label class="checkbox-row">
		<input type="checkbox" bind:checked={isPending} />
		Pending status
	</label>
	<div class="actions">
		{#if !isInbox}
			{#if project.is_archived}
				<button class="btn" onclick={restore}>Restore</button>
			{:else}
				<button class="btn" onclick={archive}>Archive</button>
			{/if}
			<button class="btn" onclick={remove} disabled={busy}>Delete</button>
		{/if}
	</div>
</Modal>

<style>
	.label {
		font-size: var(--fs-xs);
		color: var(--text-dim);
		margin-bottom: 4px;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.seg button {
		padding: 5px 14px;
		font-size: var(--fs-sm);
		color: var(--text-dim);
	}
	.seg button + button {
		border-left: 1px solid var(--border);
	}
	.seg button.on {
		background: var(--text);
		color: var(--bg);
	}
	.hint {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		margin-top: 4px;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
</style>
