<script lang="ts">
	import Icon from '../../../lib/components/Icon.svelte';
	import DateField from '../../../lib/components/DateField.svelte';
	import type { VikunjaTask } from '../../../lib/types';
	import { isShopping, setShopping } from '../../../lib/actions/shopping';
	// The dedicated task page per spec: rename, description, dates, project,
	// relations, duplicate, delete, complete, labels — everything manageable
	// from one place, plus the same keyboard shortcuts as list rows.
	import { hasDate, toDatetimeLocal } from '../../../lib/utils/dates';
	import { repeatKind, repeatFields, nextWeekdayAt, type RepeatKind } from '../../../lib/utils/recurrence';
	import { page } from '$app/state';
	import { goto, afterNavigate } from '$app/navigation';
	import { db } from '../../../lib/db/schema';
	import { liveState } from '../../../lib/db/live.svelte';
	import {
		updateTask,
		renameTask,
		moveTaskToSection,
		completeTask,
		deleteTask,
		duplicateTask,
		moveTaskToProject,
		removeTaskLabel,
		addRelation,
		removeRelation
	} from '../../../lib/actions/tasks';
	import { sortLabels } from '../../../lib/utils/labelSort';
	import { visibleLabels } from '../../../lib/utils/context';
	import { settings } from '../../../lib/stores/settings.svelte';
	import { remappedId, waitForRealId } from '../../../lib/db/idRemap';
	import { flushQueue } from '../../../lib/db/sync';
	import { toastStore } from '../../../lib/stores/toast.svelte';
	import LabelChip from '../../../lib/components/LabelChip.svelte';
	import LabelPopover from '../../../lib/components/LabelPopover.svelte';
	import InlineProjectPicker from '../../../lib/components/InlineProjectPicker.svelte';
	import { clickOutside } from '../../../lib/actions/clickOutside';
	import { getInboxProject } from '../../../lib/db/queries';
	import { isInboxProject, inReview, isTaskPending, isAbandoned } from '../../../lib/utils/context';
	import { validateTask, setTaskPending, abandonTask } from '../../../lib/actions/tasks';

	import { renderDescription } from '../../../lib/utils/markdown';

	const taskId = $derived(Number(page.params.id));
	const task = liveState(() => db.tasks.get(taskId), undefined);
	// The sections of its project on this device (5 Nov 2026: move a task to another section
	// without dragging it).
	const taskSections = liveState(async () => {
		const t = await db.tasks.get(taskId);
		return t ? db.sections.where('project_id').equals(t.project_id).sortBy('position') : [];
	}, []);
	// A task that was just created has a temporary id until the server saves it; follow it to the real one.
	$effect(() => {
		const real = remappedId(taskId);
		if (real && !task.value) goto(`/task/${real}`, { replaceState: true });
	});
	const allProjects = liveState(() => db.projects.toArray(), []);
	// Full path to the task's project, from the top-level project down: Root / Middle / Project.
	const projectPath = $derived.by(() => {
		const byId = new Map(allProjects.value.map((p) => [p.id, p]));
		const names: string[] = [];
		let p = task.value ? byId.get(task.value.project_id) : undefined;
		let guard = 0;
		while (p && guard++ < 30) {
			names.unshift(p.title);
			p = p.parent_project_id ? byId.get(p.parent_project_id) : undefined;
		}
		return names.join(' / ');
	});
	// Where the project sits (its parents), shown next to it: "in HOME".
	const parentPath = $derived(projectPath.includes(' / ') ? projectPath.slice(0, projectPath.lastIndexOf(' / ')) : '');
	const inInbox = $derived(task.value ? isInboxProject(task.value.project_id, new Map(allProjects.value.map((p) => [p.id, p]))) : false);
	async function backToInbox() {
		const inbox = await getInboxProject();
		if (inbox) await moveTaskToProject(taskId, inbox.id);
	}
	const project = liveState(() => (task.value ? db.projects.get(task.value.project_id) : undefined), undefined);

	// Still in the Inbox view (not validated yet): it can be validated from here once it has a project.
	const toValidate = $derived(task.value ? inReview(task.value) || inInbox : false);
	async function validate() {
		if (inInbox) return toastStore.error("Can't validate the definition yet: choose a project.");
		await validateTask(taskId);
		toastStore.success('Validated: it has left the Inbox view');
	}

	// The title box grows with its text, on every line it needs.
	let titleEl: HTMLTextAreaElement | undefined = $state();
	function growTitle() {
		if (!titleEl) return;
		titleEl.style.height = 'auto';
		titleEl.style.height = `${titleEl.scrollHeight}px`;
	}
	$effect(() => {
		void titleDraft;
		requestAnimationFrame(growTitle);
	});


	let titleDraft = $state('');
	let descDraft = $state('');
	let editingDesc = $state(false);
	let labelPopoverOpen = $state(false);
	let relationQuery = $state('');
	let linking = $state(false);
	const relationCount = $derived(Object.values(task.value?.related_tasks ?? {}).reduce((n, l) => n + (l?.length ?? 0), 0));
	let relationKind = $state<'precedes' | 'follows'>('precedes');

	$effect(() => {
		if (task.value) {
			titleDraft = task.value.title;
			descDraft = task.value.description ?? '';
		}
	});

	// Repeat: the due date carries the weekday and time (or the day and month), the choice here is
	// only how often. "Every week" also asks for the weekday and the time.
	const kind = $derived(task.value ? repeatKind(task.value) : 'none');
	const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dueDateObj = $derived(task.value && hasDate(task.value.due_date) ? new Date(task.value.due_date) : null);
	const repWeekday = $derived(dueDateObj ? dueDateObj.getDay() : 1);
	const repTime = $derived(
		dueDateObj ? `${String(dueDateObj.getHours()).padStart(2, '0')}:${String(dueDateObj.getMinutes()).padStart(2, '0')}` : '09:00'
	);
	// One reminder per task (the first one Vikunja holds); others, if any, are kept as they are.
	const reminderOf = (t: VikunjaTask) => (t.reminders ?? []).map((r) => r.reminder).find((r) => hasDate(r)) ?? null;
	function setReminder(iso: string | null) {
		const others = (task.value?.reminders ?? []).filter((r) => hasDate(r.reminder)).slice(1);
		updateTask(taskId, { reminders: iso ? [{ reminder: iso }, ...others] : others });
	}
	function setRepeat(k: RepeatKind) {
		const patch: Record<string, unknown> = { ...repeatFields(k) };
		if (k !== 'none' && !dueDateObj) {
			// A repeat needs a due date to start from.
			const d = k === 'week' ? nextWeekdayAt(1, 9, 0) : new Date(new Date().setHours(9, 0, 0, 0));
			if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
			patch.due_date = d.toISOString();
		}
		updateTask(taskId, patch);
	}
	function setWeekTime(weekday: number, time: string) {
		const [h, m] = time.split(':').map(Number);
		updateTask(taskId, { due_date: nextWeekdayAt(weekday, h || 0, m || 0).toISOString() });
	}

	function commitTitle() {
		if (task.value && titleDraft.trim() && titleDraft !== task.value.title) renameTask(taskId, titleDraft.trim());
	}
	function commitDesc() {
		if (task.value) updateTask(taskId, { description: descDraft });
	}

	// Back to the page you came from (the Inbox, a project, a review…); the home page when the
	// task was opened directly (a link, a reload).
	let cameFromApp = false;
	afterNavigate(({ from, to, type }) => {
		if (type !== 'enter' && from && from.url.pathname !== to?.url.pathname) cameFromApp = true;
	});
	function leave() {
		if (cameFromApp) history.back();
		else goto('/');
	}

	async function remove() {
		if (confirm('Move this task to the Bin? You can restore it for 30 days.')) {
			await deleteTask(taskId);
			leave();
		}
	}

	async function duplicate() {
		// The copy opens straight away so it can be edited (its name already ends in _2, _3...).
		const tempId = await duplicateTask(taskId);
		const newId = await waitForRealId(tempId, () => void flushQueue());
		goto(`/task/${newId}`);
		toastStore.success('Task duplicated');
	}

	// Candidates for a new relation: open tasks matching the text, never this task
	// itself nor one it is already linked to (it used to link the first match blindly).
	let relationMatches = $state<{ id: number; title: string }[]>([]);
	$effect(() => {
		const q = relationQuery.trim().toLowerCase();
		const linked = new Set(Object.values(task.value?.related_tasks ?? {}).flat().map((r) => r.id));
		if (!q) {
			relationMatches = [];
			return;
		}
		void db.tasks
			.filter((t) => !t.done && t.id !== taskId && !linked.has(t.id) && t.title.toLowerCase().includes(q))
			.limit(8)
			.toArray()
			.then((list) => {
				if (relationQuery.trim().toLowerCase() === q) relationMatches = list.map((t) => ({ id: t.id, title: t.title }));
			});
	});
	async function linkTo(otherId: number) {
		await addRelation(taskId, otherId, relationKind);
		relationQuery = '';
		relationMatches = [];
	}
	async function addTaskRelation() {
		if (!relationQuery.trim()) return;
		const q = relationQuery.trim().toLowerCase();
		const exact = relationMatches.find((m) => m.title.toLowerCase() === q);
		if (exact) return linkTo(exact.id);
		if (relationMatches.length === 1) return linkTo(relationMatches[0].id);
		toastStore.error(relationMatches.length ? 'Several tasks match: pick one in the list.' : 'No open task matches.');
	}

	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
		if (!task.value) return;
		if (e.key === 'v' && toValidate) {
			e.preventDefault();
			validate();
			return;
		}
		if (e.key === 'x' || e.key === ' ') {
			e.preventDefault();
			completeTask(taskId, !task.value.done);
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			remove();
		} else if (e.key === 'l') {
			e.preventDefault();
			labelPopoverOpen = true;
		} else if (e.key === 'Escape') {
			leave();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{task.value ? `${task.value.title} — Tasks` : 'Tasks'}</title>
</svelte:head>

{#if task.value}
	<!-- 11 Nov 2026: one compact page. The title, two switches, the properties as one line each
	     (name on the left, value on the right), the notes, then linked tasks; explanations went
	     into tooltips and the user guide. -->
	<div class="task-page page">
		<div class="top-row">
			<button class="checkbox" class:done={task.value.done} onclick={() => completeTask(taskId, !task.value!.done)} aria-label={task.value.done ? 'Mark as not done' : 'Complete'}>
				{#if task.value.done}{isAbandoned(task.value) ? '✕' : '✓'}{/if}
			</button>
			<textarea
				class="title"
				rows="1"
				bind:this={titleEl}
				bind:value={titleDraft}
				oninput={growTitle}
				onblur={commitTitle}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commitTitle();
						(e.currentTarget as HTMLTextAreaElement).blur();
					}
				}}
			></textarea>
		</div>

		{#if toValidate}
			<div class="validate-bar">
				<span>{inInbox ? 'In the Inbox: choose a project, then validate.' : 'Not validated yet.'}</span>
				<button class="btn btn-primary" disabled={inInbox} onclick={validate}>Validate definition</button>
			</div>
		{/if}

		{#if task.value.done && isAbandoned(task.value)}
			<div class="abandoned-bar"><span>Abandoned</span><button class="link-btn" onclick={() => abandonTask(taskId, false)}>Reopen</button></div>
		{/if}

		<div class="switches">
			<label class="switch shop-toggle" title="On the Shopping list (skips the Inbox)">
				<input type="checkbox" checked={isShopping(task.value)} onchange={(e) => setShopping(taskId, (e.target as HTMLInputElement).checked)} />
				<Icon name="cart" size={14} /> Shopping
			</label>
			<label class="switch pend-toggle" title="On hold: stays in its project, leaves the home page and Tomorrow until resumed">
				<input type="checkbox" checked={isTaskPending(task.value)} onchange={(e) => setTaskPending(taskId, (e.target as HTMLInputElement).checked)} />
				Pending
			</label>
		</div>

		<div class="props">
			<div class="field">
				<span class="label">Project</span>
				<div class="value project-row">
					<InlineProjectPicker
						selected={project.value ?? null}
						clearable={false}
						onChange={(p) => p && moveTaskToProject(taskId, p.id)}
					/>
					{#if parentPath}<span class="path" title={projectPath}>in {parentPath}</span>{/if}
					{#if !inInbox}<button class="link-btn" onclick={backToInbox} title="Back to the Inbox">↩ Inbox</button>{/if}
				</div>
			</div>
			{#if taskSections.value.length}
				<div class="field">
					<span class="label">Section</span>
					<div class="value">
						<select
							value={String(task.value.section_id ?? '')}
							onchange={(e) => {
								const v = (e.target as HTMLSelectElement).value;
								moveTaskToSection(taskId, v ? Number(v) : null);
							}}
						>
							<option value="">None</option>
							{#each taskSections.value as sec (sec.id)}<option value={String(sec.id)}>{sec.title}</option>{/each}
						</select>
					</div>
				</div>
			{/if}
			<div class="field">
				<span class="label">Labels</span>
				<div class="value labels-row" use:clickOutside={() => (labelPopoverOpen = false)}>
					{#each sortLabels(visibleLabels(task.value.labels), settings.colorOrder) as l (l.id)}
						<button class="chip-remove" title="Click to remove" aria-label="Remove label {l.title}" onclick={() => removeTaskLabel(taskId, l.id)}>
							<LabelChip label={l} />
						</button>
					{/each}
					<button class="add-btn" onclick={() => (labelPopoverOpen = true)} aria-label="Add a label" title="Add a label">+</button>
					{#if labelPopoverOpen}
						<LabelPopover taskId={taskId} assignedLabels={visibleLabels(task.value.labels)} onClose={() => (labelPopoverOpen = false)} flip />
					{/if}
				</div>
			</div>
			<div class="field">
				<span class="label">Start</span>
				<div class="value">
					<DateField kind="start" label="Start" value={task.value.start_date} onCommit={(iso) => updateTask(taskId, { start_date: iso })} />
					{#if hasDate(task.value.start_date)}<button class="link-btn" onclick={() => updateTask(taskId, { start_date: null })} aria-label="Remove the start date" title="Remove the date">×</button>{/if}
				</div>
			</div>
			<div class="field">
				<span class="label">Due</span>
				<div class="value">
					<span class="due-wrap" class:overdue={!task.value.done && hasDate(task.value.due_date) && new Date(task.value.due_date) < new Date()}>
						<DateField kind="due" label="Due" value={task.value.due_date} onCommit={(iso) => updateTask(taskId, { due_date: iso })} />
					</span>
					{#if hasDate(task.value.due_date)}<button class="link-btn" onclick={() => updateTask(taskId, { due_date: null })} aria-label="Remove the due date" title="Remove the date">×</button>{/if}
					{#if !task.value.done && hasDate(task.value.due_date) && new Date(task.value.due_date) < new Date()}
						<span class="overdue-badge">Overdue</span>
					{/if}
				</div>
			</div>
			<!-- 19 Nov 2026: a reminder; the PC notifies your phone at that time (Help > Alerts topic). -->
			<div class="field">
				<span class="label">Remind</span>
				<div class="value">
					<DateField kind="reminder" label="Reminder" value={reminderOf(task.value)} onCommit={(iso) => setReminder(iso)} />
					{#if reminderOf(task.value)}<button class="link-btn" onclick={() => setReminder(null)} aria-label="Remove the reminder" title="Remove the reminder">×</button>{/if}
				</div>
			</div>
			<div class="field">
				<span class="label">Repeat</span>
				<div class="value repeat-row" title={kind !== 'none' ? 'Completing the task moves its due date to the next time' : undefined}>
					<select value={kind === 'day' ? 'none' : kind} onchange={(e) => setRepeat((e.target as HTMLSelectElement).value as RepeatKind)}>
						<option value="none">Never</option>
						<option value="week">Every week</option>
						<option value="month">Every month</option>
						<option value="year">Every year</option>
					</select>
					{#if kind === 'week'}
						<select aria-label="Day" value={repWeekday} onchange={(e) => setWeekTime(Number((e.target as HTMLSelectElement).value), repTime)}>
							{#each WEEKDAYS as name, i (i)}<option value={i}>{name}</option>{/each}
						</select>
						<input type="time" aria-label="Time" value={repTime} onchange={(e) => setWeekTime(repWeekday, (e.target as HTMLInputElement).value)} />
					{/if}
				</div>
			</div>
		</div>

		<div class="notes">
			<div class="notes-head">
				<span class="label">Notes</span>
				<span class="md-hint" title="Markdown: **bold**, *italic*, - list, # title, [text](https://…)">Markdown</span>
			</div>
			{#if editingDesc || !descDraft.trim()}
				<!-- svelte-ignore a11y_autofocus -->
				<textarea class="desc-edit" rows={editingDesc ? 6 : 2} bind:value={descDraft} autofocus={editingDesc} placeholder="Add notes, links…" onblur={() => { commitDesc(); editingDesc = false; }}></textarea>
			{:else}
				<!-- Click the text to edit it; a click on a link opens the link. -->
				<div
					class="desc-view md"
					role="button"
					tabindex="0"
					title="Click to edit"
					onclick={(e) => { if (!(e.target as HTMLElement).closest('a')) editingDesc = true; }}
					onkeydown={(e) => e.key === 'Enter' && (editingDesc = true)}
				>
					{@html renderDescription(descDraft)}
				</div>
			{/if}
		</div>

		<div class="links">
			{#if relationCount}
				<span class="label">Linked tasks</span>
				<div class="relations-list">
					{#each Object.entries(task.value.related_tasks ?? {}) as [kind, related]}
						{#each related as r (r.id)}
							<div class="relation-row">
								<span class="kind-badge">{kind}</span>
								<a href="/task/{r.id}">{r.title}</a>
								<button class="btn-icon" aria-label="Remove the link" onclick={() => removeRelation(taskId, r.id, kind)}>×</button>
							</div>
						{/each}
					{/each}
				</div>
			{/if}
			{#if linking || relationCount}
				<div class="relations-add">
					<select bind:value={relationKind} aria-label="Link kind">
						<option value="precedes">Precedes</option>
						<option value="follows">Follows</option>
					</select>
					<input type="text" placeholder="Search a task to link…" bind:value={relationQuery} onkeydown={(e) => e.key === 'Enter' && addTaskRelation()} />
					<button class="btn" onclick={addTaskRelation}>Link</button>
				</div>
				{#if relationMatches.length}
					<ul class="rel-matches">
						{#each relationMatches as m (m.id)}
							<li><button onclick={() => linkTo(m.id)}>{m.title}</button></li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>

		<div class="actions">
			{#if !linking && !relationCount}<button class="link-btn nowrap" onclick={() => (linking = true)}><Icon name="link" size={14} /> Link a task</button>{/if}
			<span class="spacer"></span>
			<button class="btn" onclick={duplicate}>Duplicate</button>
			{#if !task.value.done}<button class="btn" onclick={async () => { await abandonTask(taskId); toastStore.success('Abandoned: in the Bin'); leave(); }} title="Close it without doing it: it goes to the Bin">Abandon</button>{/if}
			<button class="btn danger" onclick={remove}>Delete</button>
		</div>
	</div>
{:else}
	<div class="not-found">Task not found (it may still be syncing).</div>
{/if}

<style>
	.chip-remove {
		padding: 0;
		border-radius: 999px;
		cursor: pointer;
	}
	.chip-remove:hover {
		opacity: 0.55;
		text-decoration: line-through;
	}
	.task-page {
		max-width: 720px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.top-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.checkbox {
		width: 24px;
		height: 24px;
		margin-top: 7px;
		border-radius: 50%;
		border: 1.5px solid var(--border-strong);
		flex-shrink: 0;
		color: var(--accent);
	}
	.checkbox.done {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.title {
		flex: 1;
		min-width: 0;
		resize: none;
		overflow: hidden;
		line-height: 1.3;
		font-family: inherit;
		color: inherit;
		font-size: var(--fs-xl);
		font-weight: 600;
		letter-spacing: -0.01em;
		border: none;
		background: none;
		padding: 4px 0;
		height: auto;
		border-radius: 0;
	}
	.title:focus {
		outline: none;
		border: none;
	}
	.path {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}
	.abandoned-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text-dim);
		font-size: var(--fs-sm);
	}
	.validate-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		padding: 8px 12px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #ffd152 22%, transparent);
		font-size: var(--fs-sm);
	}
	/* Two on/off switches, as chips */
	.switches {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px 4px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--fs-sm);
		color: var(--text-dim);
		cursor: pointer;
		user-select: none;
	}
	.switch:hover {
		border-color: var(--text-faint);
	}
	.switch:has(input:checked) {
		background: var(--bg-hover);
		border-color: var(--text-faint);
		color: var(--text);
		font-weight: 500;
	}
	.switch input {
		margin: 0;
	}
	/* Properties: one line each, the name in a narrow column */
	.props {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border);
	}
	.field {
		display: grid;
		grid-template-columns: 96px 1fr;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
	}
	.value {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		min-width: 0;
	}
	.label {
		font-size: var(--fs-sm);
		color: var(--text-faint);
	}
	.value select,
	.value :global(input[type='date']),
	.value :global(input[type='time']) {
		border-color: transparent;
		background: transparent;
	}
	.value select:hover,
	.value :global(input:hover),
	.value select:focus,
	.value :global(input:focus) {
		border-color: var(--border);
	}
	.due-wrap.overdue :global(input) {
		color: var(--danger);
	}
	.overdue-badge {
		color: var(--danger);
		font-size: var(--fs-xs);
		font-weight: 600;
	}
	.link-btn {
		font-size: var(--fs-sm);
		color: var(--text-faint);
		padding: 2px 6px;
		border-radius: var(--radius);
	}
	.link-btn:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
	.add-btn {
		width: 26px;
		height: 26px;
		border-radius: 999px;
		border: 1px dashed var(--border-strong, var(--border));
		color: var(--text-dim);
		line-height: 1;
	}
	.add-btn:hover {
		color: var(--text);
		border-style: solid;
	}
	.labels-row {
		position: relative;
		gap: 6px;
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.notes-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.md-hint {
		font-size: var(--fs-2xs);
		color: var(--text-faint);
		cursor: help;
	}
	textarea.desc-edit {
		width: 100%;
		resize: vertical;
	}
	.desc-view {
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 6px 8px;
		margin: 0 -8px;
		cursor: text;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.desc-view:hover {
		border-color: var(--border);
	}
	.md :global(p) { margin: 0 0 0.6em; }
	.md :global(p:last-child) { margin-bottom: 0; }
	.md :global(ul), .md :global(ol) { margin: 0 0 0.6em; padding-left: 1.4em; }
	.md :global(h1), .md :global(h2), .md :global(h3) { font-size: 1.05em; margin: 0.4em 0; }
	.md :global(a) { color: var(--accent); text-decoration: underline; }
	.md :global(code) { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--bg-hover, rgba(127,127,127,.15)); padding: 0 3px; border-radius: 3px; }
	.md :global(pre) { overflow-x: auto; background: var(--bg-hover, rgba(127,127,127,.15)); padding: 6px 8px; border-radius: 4px; }
	.md :global(blockquote) { margin: 0 0 0.6em; padding-left: 10px; border-left: 3px solid var(--border); color: var(--text-dim); }
	.md :global(input[type='checkbox']) { margin-right: 4px; }
	.links {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.links:empty {
		display: none;
	}
	.relations-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.relation-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
	}
	.kind-badge {
		font-size: var(--fs-xs);
		background: var(--bg-elevated);
		border-radius: 999px;
		padding: 0 8px;
		color: var(--text-dim);
	}
	.relations-add {
		display: flex;
		gap: 6px;
	}
	.relations-add input {
		flex: 1;
		min-width: 0;
	}
	.rel-matches {
		list-style: none;
		margin: 0;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.rel-matches button {
		width: 100%;
		text-align: left;
		padding: 8px;
		border-radius: var(--radius);
		font-size: var(--fs-sm);
	}
	.rel-matches button:hover {
		background: var(--bg-hover);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
	.spacer {
		flex: 1;
	}
	.actions .btn,
	.nowrap {
		white-space: nowrap;
	}
	.nowrap {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	@media (max-width: 560px) {
		.actions {
			flex-wrap: wrap;
			gap: 2px;
		}
		.actions .btn {
			padding: 0 9px;
		}
	}
	.danger:hover {
		color: var(--danger);
	}
	@media (max-width: 560px) {
		.title {
			font-size: var(--fs-lg);
		}
		.field {
			grid-template-columns: 64px 1fr;
			gap: 8px;
		}
	}
	.not-found {
		padding: 40px;
		text-align: center;
		color: var(--text-faint);
	}
</style>
