<script lang="ts">
	// Links one task to another ("precedes" / "follows") without opening it.
	import { db } from '../db/schema';
	import { liveState } from '../db/live.svelte';
	import { addRelation, removeRelation } from '../actions/tasks';
	import type { VikunjaTask } from '../types';

	let { task, onClose }: { task: VikunjaTask; onClose: () => void } = $props();

	let kind = $state<'precedes' | 'follows'>('follows');
	let query = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	const open = liveState(() => db.tasks.filter((t) => !t.done).toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	const projectName = $derived(new Map(projects.value.map((p) => [p.id, p.title])));

	const linkedIds = $derived(
		new Set(Object.values(task.related_tasks ?? {}).flatMap((l) => l.map((r) => r.id)))
	);
	const matches = $derived(
		query.trim()
			? open.value
					.filter(
						(t) =>
							t.id !== task.id &&
							!linkedIds.has(t.id) &&
							t.title.toLowerCase().includes(query.trim().toLowerCase())
					)
					.slice(0, 8)
			: []
	);
	const existing = $derived(
		Object.entries(task.related_tasks ?? {}).flatMap(([k, list]) =>
			['precedes', 'follows'].includes(k) ? list.map((r) => ({ ...r, kind: k })) : []
		)
	);

	$effect(() => {
		inputEl?.focus();
	});

	async function link(other: VikunjaTask) {
		await addRelation(task.id, other.id, kind);
		query = '';
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="pop" role="dialog" aria-label="Links">
	{#each existing as r (r.kind + r.id)}
		<div class="existing">
			<span class="kind">{r.kind === 'precedes' ? 'Precedes' : 'Follows'}</span>
			<a href="/task/{r.id}" class="name">{r.title}</a>
			<button class="x" aria-label="Remove link" onclick={() => removeRelation(task.id, r.id, r.kind)}>×</button>
		</div>
	{/each}
	<div class="add">
		<select bind:value={kind} aria-label="Link type">
			<option value="follows">Follows (comes after)</option>
			<option value="precedes">Precedes (comes before)</option>
		</select>
		<input bind:this={inputEl} type="text" placeholder="Search a task to link…" bind:value={query} />
	</div>
	{#each matches as m (m.id)}
		<button class="match" onclick={() => link(m)}>
			<span class="name">{m.title}</span>
			<span class="proj">{projectName.get(m.project_id) ?? ''}</span>
		</button>
	{/each}
	{#if query.trim() && matches.length === 0}
		<div class="none">No matching task</div>
	{/if}
</div>

<style>
	.pop {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 260px;
	}
	.existing,
	.match {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
		padding: 4px 6px;
		border-radius: var(--radius);
		text-align: left;
	}
	.match:hover {
		background: var(--bg-hover);
	}
	.kind {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.proj {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.x {
		color: var(--text-faint);
	}
	.x:hover {
		color: var(--danger);
	}
	.add {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}
	.none {
		font-size: var(--fs-sm);
		color: var(--text-faint);
		padding: 4px 6px;
	}
</style>
