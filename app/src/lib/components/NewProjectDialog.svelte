<script lang="ts">
	import Modal from './Modal.svelte';
	import InlineProjectPicker from './InlineProjectPicker.svelte';
	import { createProject } from '../actions/projects';
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { CONTEXTS, typeSource, projectOwnType, type Context } from '../utils/context';
	import { areaFilter } from '../stores/areaFilter.svelte';
	import type { VikunjaProject } from '../types';

	let {
		onClose,
		initialTitle = '',
		onCreated
	}: { onClose: () => void; initialTitle?: string; onCreated?: (id: number) => void } = $props();

	let title = $state(initialTitle);
	let parent = $state<VikunjaProject | null>(null);
	let isPending = $state(false);
	let error = $state('');
	const allProjects = liveState(() => db.projects.toArray(), []);
	const byId = $derived(new Map(allProjects.value.map((p) => [p.id, p])));
	// A parent that already has a type decides for everything under it.
	const inheritedFrom = $derived(parent ? typeSource(parent.id, byId) : null);
	// Starts on the view you are in (Pro / Perso), otherwise no type.
	let typeChoice = $state<Context | null>(areaFilter.area === 'Pro' || areaFilter.area === 'Perso' ? areaFilter.area : null);

	async function submit() {
		if (!title.trim()) return;
		// Refuse a project that already exists with the same name in the same place.
		const wanted = title.trim().toLowerCase();
		const parentId = parent?.id ?? 0;
		const clash = await db.projects
			.filter((p) => p.id > 0 && p.title.trim().toLowerCase() === wanted && (p.parent_project_id ?? 0) === parentId)
			.first();
		if (clash) {
			error = parent
				? `A project called “${clash.title}” already exists inside “${parent.title}”.`
				: `A top-level project called “${clash.title}” already exists.`;
			return;
		}
		const id = await createProject({ title: title.trim(), parent_project_id: parent?.id, is_pending: isPending, context: inheritedFrom ? null : typeChoice });
		onCreated?.(id);
		onClose();
	}
</script>

<Modal title="New project" {onClose}>
	<input
		type="text"
		placeholder="Project name"
		bind:value={title}
		oninput={() => (error = '')}
		onkeydown={(e) => e.key === 'Enter' && submit()}
	/>
	{#if error}<div class="error" role="alert">{error}</div>{/if}
	<div>
		<div class="label">Parent project (optional)</div>
		<InlineProjectPicker selected={parent} onChange={(p) => { parent = p; error = ''; }} placeholder="None (top level)" />
	</div>
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
	<label class="checkbox-row">
		<input type="checkbox" bind:checked={isPending} />
		Pending status
	</label>
	<button class="btn btn-primary" onclick={submit}>Create</button>
</Modal>

<style>
	.error {
		font-size: var(--fs-sm);
		color: var(--danger);
	}
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
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
	}
</style>
