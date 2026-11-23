<script lang="ts">
	import { shown as featureShown } from '../stores/features.svelte';
	import Icon from './Icon.svelte';
	import DateField from './DateField.svelte';
	import { goto } from '$app/navigation';
	import { sortLabels } from '../utils/labelSort';
	import { visibleLabels, isTaskPending, isAbandoned, isOngoing } from '../utils/context';
	import { settings } from '../stores/settings.svelte';
	import {
		completeTask,
		validateTask,
		renameTask,
		moveTaskToProject,
		updateTask,
		removeTaskLabel
	} from '../actions/tasks';
	import { hasDate, toDatetimeLocal, endOfDayIso } from '../utils/dates';
	import { toastStore } from '../stores/toast.svelte';
	import { clickOutside } from '../actions/clickOutside';
	import { placeVertically } from '../actions/placeVertically';
	import LabelChip from './LabelChip.svelte';
	import LabelPopover from './LabelPopover.svelte';
	import TaskLinkPopover from './TaskLinkPopover.svelte';
	import { getInboxProject } from '../db/queries';
	import { viewport } from '../stores/viewport.svelte';
	import ProjectPicker from './ProjectPicker.svelte';
	import { multiSelect, isMultiSelected } from '../stores/multiSelect.svelte';
	import TaskActionSheet from './TaskActionSheet.svelte';
	import type { VikunjaTask } from '../types';

	let {
		task,
		projectName,
		projectRoot,
		sortContext = false,
		simple = false,
		projectWidth = undefined,
		lead = undefined,
		noProject = false,
		selected = false,
		editing = false,
		labelPopoverOpen = false,
		movePopoverOpen = false,
		onSelect,
		onStopEditing,
		onCloseLabelPopover,
		onCloseMovePopover,
		onPick
	}: {
		task: VikunjaTask;
		projectName?: string;
		// Home lists: the top-level project the task's project sits under (shown as Root/project).
		projectRoot?: string;
		// Input view: changing the context keeps the task in the list until
		// it is validated with the square on the right.
		sortContext?: boolean;
		// Home lists of All / Pro / Perso: wider project column, no start date or links columns.
		simple?: boolean;
		// Narrower project column where room is short (review pages).
		projectWidth?: string;
		// In place of the completion circle (13 Nov 2026: the candidates of the reviews are picked, not completed).
		lead?: import('svelte').Snippet<[VikunjaTask]>;
		noProject?: boolean;
		selected?: boolean;
		editing?: boolean;
		labelPopoverOpen?: boolean;
		movePopoverOpen?: boolean;
		onSelect: (e?: MouseEvent) => void;
		onStopEditing: () => void;
		onCloseLabelPopover: () => void;
		onCloseMovePopover: () => void;
		// Add or remove this task from the selection of several tasks ('range': Shift).
		onPick?: (mode: 'toggle' | 'range') => void;
	} = $props();
	const picked = $derived(isMultiSelected(task.id));
	const selecting = $derived(multiSelect.ids.length > 0);

	const sortedLabels = $derived(sortLabels(visibleLabels(task.labels), settings.colorOrder));
	const isOverdue = $derived(!task.done && hasDate(task.due_date) && new Date(task.due_date) < new Date());
	const linkCount = $derived(
		Object.entries(task.related_tasks ?? {})
			.filter(([k]) => k === 'precedes' || k === 'follows')
			.reduce((n, [, l]) => n + l.length, 0)
	);

	// --- Title / labels layout rule ----------------------------------------------
	// 1. Everything fits: title and labels on one line.
	// 2. Otherwise the title may use two lines, labels stay on one.
	// 3. Otherwise labels go on 2 lines (in the narrowest box that holds them, so the
	//    title keeps the most room) and the title is cut after 2 lines with "…".
	// 4. If the labels do not fit on 2 lines while leaving 5 cm to the title, they get
	//    3, then 4 lines (the title too). Beyond 4 lines the labels are cut with "…".
	const MIN_TITLE = 189; // 5 cm in CSS pixels
	const GAP = 10;
	const CHIP_GAP = 4;
	let mainW = $state(0);
	let projW = $state(0);
	let projEl: HTMLElement | undefined = $state();
	let rowLines = $state(1);
	let titleEl: HTMLElement | undefined = $state();
	let labelsEl: HTMLDivElement | undefined = $state();
	let chipWidths = $state<number[]>([]);
	let chipH = $state(22);

	$effect(() => {
		void sortedLabels;
		void isEditing;
		const el = labelsEl;
		if (!el) return;
		requestAnimationFrame(() => {
			const kids = [...el.children].filter((c) => (c as HTMLElement).classList.contains('label-remove')) as HTMLElement[];
			chipWidths = kids.map((c) => c.offsetWidth);
			if (kids[0]) chipH = kids[0].offsetHeight || 22;
		});
	});

	let measureCtx: CanvasRenderingContext2D | null = null;
	function textWidth(text: string, font: string): number {
		measureCtx ??= document.createElement('canvas').getContext('2d');
		if (!measureCtx) return text.length * 8;
		measureCtx.font = font;
		return measureCtx.measureText(text).width;
	}
	function titleLinesAt(text: string, width: number, font: string): number {
		let lines = 1;
		let x = 0;
		const space = textWidth(' ', font);
		for (const word of text.split(/\s+/)) {
			const w = textWidth(word, font);
			if (x > 0 && x + space + w > width) {
				lines++;
				x = 0;
			}
			if (w > width) lines += Math.floor(w / width);
			x += (x > 0 ? space : 0) + w;
		}
		return lines;
	}
	function chipLines(widths: number[], w: number): number {
		let n = 1;
		let x = 0;
		for (const cw of widths) {
			if (x > 0 && x + CHIP_GAP + cw > w) {
				n++;
				x = cw;
			} else x = x > 0 ? x + CHIP_GAP + cw : cw;
		}
		return n;
	}

	const plan = $derived.by(() => {
		const none = { labelsW: null as number | null, titleLines: 2, labelLines: 1, cropped: false };
		// Phone: the title gets the full width (up to 3 lines) and the labels wrap below it.
		if (viewport.phone) return { labelsW: null as number | null, titleLines: 3, labelLines: 20, cropped: false };
		if (!mainW || chipWidths.length === 0 || typeof document === 'undefined') return none;
		const font = titleEl ? getComputedStyle(titleEl).font : '15px sans-serif';
		const widths = chipWidths;
		const L1 = widths.reduce((a, b) => a + b, 0) + CHIP_GAP * (widths.length - 1);
		const T = textWidth(task.title, font);
		if (T + GAP + L1 <= mainW) return { labelsW: L1 + 1, titleLines: 1, labelLines: 1, cropped: false };
		const w1 = mainW - L1 - GAP;
		if (w1 >= MIN_TITLE && titleLinesAt(task.title, w1, font) <= 2)
			return { labelsW: L1 + 1, titleLines: 2, labelLines: 1, cropped: false };
		const avail = mainW - GAP - MIN_TITLE;
		for (let k = 2; k <= 4; k++) {
			let w = Math.max(...widths);
			while (w < L1 && chipLines(widths, w) > k) w += 2;
			if (w <= avail) return { labelsW: w + 1, titleLines: k, labelLines: k, cropped: false };
		}
		return { labelsW: Math.max(avail, 60), titleLines: 4, labelLines: 4, cropped: true };
	});
	// How many lines the title / labels use: the project is written on as many lines, or on one.
	$effect(() => {
		void task.title;
		void plan;
		void mainW;
		void sortedLabels;
		requestAnimationFrame(() => {
			const lh = (titleEl && parseFloat(getComputedStyle(titleEl).lineHeight)) || 20;
			const tl = titleEl ? Math.max(1, Math.round(titleEl.offsetHeight / lh)) : 1;
			const ll = sortedLabels.length > 0 ? plan.labelLines : 1;
			rowLines = Math.max(1, tl, ll);
		});
	});

	const cutText = (t: string, n: number) => (t.length <= n ? t : t.slice(0, Math.max(1, n - 1)) + '…');
	// "Root/project": the root is shortened first (never below 5 characters), then the project.
	const projectShown = $derived.by(() => {
		if (!projectName || !projectRoot) return { multi: false, text: projectName ?? '', root: '', local: '' };
		// The top-level project is always its first 5 characters, nothing added.
		const root5 = projectRoot.slice(0, 5);
		if (viewport.phone) return { multi: false, text: projectRoot === projectName ? projectName : `${projectRoot} / ${projectName}`, root: '', local: '' };
		if (rowLines >= 2) return { multi: true, text: '', root: root5, local: projectName };
		// One line: if root and project do not fit together, the project is shortened.
		const el = projEl;
		if (!el || projW <= 0) return { multi: false, text: `${root5}/${projectName}`, root: '', local: '' };
		const cs = getComputedStyle(el);
		const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
		const probe = document.createElement('span');
		probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;';
		el.appendChild(probe);
		const fits = (t: string) => {
			probe.textContent = t;
			return probe.getBoundingClientRect().width <= W;
		};
		let text = `${root5}/${projectName}`;
		for (let m = projectName.length - 1; m >= 1 && !fits(text); m--) text = `${root5}/${cutText(projectName, m)}`;
		probe.remove();
		return { multi: false, text, root: '', local: '' };
	});
	const labelsMaxH = $derived(plan.labelLines * chipH + (plan.labelLines - 1) * CHIP_GAP + 4);

	// Inbox view: the circle on the left validates the definition (click) or
	// validates and completes the task (right-click). Both need a project first.
	function definitionReady(action: 'validate' | 'complete'): boolean {
		if (!noProject) return true;
		toastStore.error(
			action === 'validate'
				? "Can't validate the definition yet: choose a project."
				: "Can't complete this task yet: choose a project first."
		);
		return false;
	}
	function circleClick(e: MouseEvent) {
		e.stopPropagation();
		if (!sortContext) return completeTask(task.id, !task.done);
		if (definitionReady('validate')) validateTask(task.id);
	}
	function circleRightClick(e: MouseEvent) {
		if (!sortContext) return;
		e.preventDefault();
		e.stopPropagation();
		if (!definitionReady('complete')) return;
		validateTask(task.id);
		completeTask(task.id, true);
	}

	// Every property is edited in place through a small popover.
	type Popover = 'type' | 'project' | 'due' | 'start' | 'labels' | 'link' | null;
	let popover = $state<Popover>(null);
	let dragging = $state(false);
	const labelsOpen = $derived(labelPopoverOpen || popover === 'labels');
	const moveOpen = $derived(movePopoverOpen || popover === 'project');
	const anyOpen = $derived(labelsOpen || moveOpen || popover !== null);

	function closeAll() {
		popover = null;
		onCloseLabelPopover();
		onCloseMovePopover();
	}
	function toggle(which: Exclude<Popover, null>) {
		onSelect();
		const wasOpen =
			which === 'labels' ? labelsOpen : which === 'project' ? moveOpen : popover === which;
		closeAll();
		if (!wasOpen) popover = which;
	}

	function shortDate(iso: string): string {
		const d = new Date(iso);
		const sameYear = d.getFullYear() === new Date().getFullYear();
		return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }) });
	}

	const quickDates = [
		{ label: 'Today', days: 0 },
		{ label: 'Tomorrow', days: 1 },
		{ label: 'Next week', days: 7 }
	];

	// --- Phone: a long press opens the task's menu (project, labels, dates, Bin) ---
	let sheetOpen = $state(false);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressAt = { x: 0, y: 0 };
	// The finger lifted after a long press makes a click: it must neither open the task nor
	// hit the menu that has just appeared under it.
	function swallowReleaseClick() {
		const block = (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			done();
		};
		const lifted = () => setTimeout(done, 350);
		const done = () => {
			window.removeEventListener('click', block, true);
			window.removeEventListener('pointerup', lifted, true);
			window.removeEventListener('pointercancel', lifted, true);
		};
		window.addEventListener('click', block, true);
		window.addEventListener('pointerup', lifted, true);
		window.addEventListener('pointercancel', lifted, true);
		setTimeout(done, 4000);
	}
	function openSheet(fingerDown = true) {
		clearTimeout(pressTimer);
		pressTimer = undefined;
		if (fingerDown) swallowReleaseClick();
		navigator.vibrate?.(15);
		sheetOpen = true;
	}
	function pressStart(e: PointerEvent) {
		if (!viewport.phone || isEditing || e.pointerType === 'mouse' || selecting) return;
		if ((e.target as HTMLElement).closest('.checkbox')) return;
		pressAt = { x: e.clientX, y: e.clientY };
		pressTimer = setTimeout(() => openSheet(), 500);
	}
	function pressMove(e: PointerEvent) {
		if (pressTimer && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) pressCancel();
	}
	function pressCancel() {
		clearTimeout(pressTimer);
		pressTimer = undefined;
	}

	// --- Title editing: click the text, Enter saves, Alt+Enter adds a line ---
	let localEditing = $state(false);
	const isEditing = $derived(editing || localEditing);
	let editValue = $state('');
	let editInput: HTMLTextAreaElement | undefined = $state();

	function startEdit() {
		onSelect();
		editValue = task.title;
		localEditing = true;
	}
	function grow() {
		if (!editInput) return;
		editInput.style.height = 'auto';
		editInput.style.height = `${editInput.scrollHeight}px`;
	}
	$effect(() => {
		if (editing && !localEditing) editValue = task.title;
		if (isEditing && editInput) {
			editInput.focus();
			grow();
		}
	});
	function stopEdit() {
		localEditing = false;
		onStopEditing();
	}
	function commitEdit() {
		if (!isEditing) return;
		const v = editValue.trim();
		if (v && v !== task.title) renameTask(task.id, v);
		stopEdit();
	}
	function onEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.altKey || e.shiftKey) {
				const el = e.target as HTMLTextAreaElement;
				const s = el.selectionStart;
				editValue = editValue.slice(0, s) + '\n' + editValue.slice(el.selectionEnd);
				requestAnimationFrame(() => {
					el.selectionStart = el.selectionEnd = s + 1;
					grow();
				});
			} else commitEdit();
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			stopEdit();
		}
	}
</script>

<div
	class="row"
	class:phone={viewport.phone}
	style:--col-project={projectWidth ?? (simple ? '240px' : undefined)}
	class:selected
	class:picked
	class:selecting={selecting && !!onPick}
	class:dragging
	class:pending={isTaskPending(task) && !task.done}
	role="button"
	tabindex="-1"
	draggable={!isEditing && !viewport.phone}
	ondragstart={(e) => {
		e.dataTransfer?.setData('application/x-task-id', String(task.id));
		// Part of a multiple selection: all of them go together.
		if (isMultiSelected(task.id) && multiSelect.ids.length > 1) e.dataTransfer?.setData('application/x-task-ids', JSON.stringify(multiSelect.ids));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		dragging = true;
	}}
	ondragend={() => (dragging = false)}
	onclickcapture={(e) => {
		// While tasks are selected, a click anywhere on a row only adds or removes it.
		if (!onPick || !selecting || isEditing || e.ctrlKey || e.metaKey) return;
		e.stopPropagation();
		e.preventDefault();
		onPick(e.shiftKey ? 'range' : 'toggle');
	}}
	onclick={(e) => {
		if (viewport.phone && !isEditing) goto(`/task/${task.id}`);
		else onSelect(e);
	}}
	oncontextmenu={(e) => {
		if (!viewport.phone || isEditing) return;
		e.preventDefault();
		if (!sheetOpen) openSheet(pressTimer !== undefined);
	}}
	onmousedown={(e) => e.shiftKey && e.preventDefault()}
	onpointerdown={pressStart}
	onpointermove={pressMove}
	onpointerup={pressCancel}
	onpointercancel={pressCancel}
	onkeydown={(e) => {
		if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onSelect();
		}
	}}
>
	{#if onPick}
		<button
			class="pick"
			class:on={picked}
			class:shown={selecting}
			aria-label={picked ? 'Unselect this task' : 'Select this task'}
			aria-pressed={picked}
			title={picked ? 'Unselect' : 'Select (Shift: a range)'}
			onclick={(e) => {
				e.stopPropagation();
				onPick(e.shiftKey ? 'range' : 'toggle');
			}}
			onmousedown={(e) => e.shiftKey && e.preventDefault()}
		>{#if picked}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{/if}</button>
	{/if}
	{#if lead}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<span class="lead" onclick={(e) => e.stopPropagation()}>{@render lead(task)}</span>
	{:else}
	<button
		class="checkbox"
		class:right={sortContext}
		class:done={task.done}
		aria-label={sortContext ? 'Validate (click) or complete (right-click)' : task.done ? 'Mark as not done' : 'Complete task'}
		title={sortContext ? 'Click: validate the definition · Right-click: validate and complete' : undefined}
		onclick={circleClick}
		oncontextmenu={circleRightClick}
	>
		{#if task.done}{isAbandoned(task) ? '✕' : '✓'}{/if}
	</button>
	{/if}

	<div class="main" bind:clientWidth={mainW}>
		{#if isEditing}
			<textarea
				bind:this={editInput}
				class="edit-input"
				rows="1"
				bind:value={editValue}
				oninput={grow}
				onclick={(e) => e.stopPropagation()}
				onkeydown={onEditKey}
				onblur={commitEdit}
			></textarea>
		{:else}
			<button
				class="title"
				bind:this={titleEl}
				style:-webkit-line-clamp={plan.titleLines}
				style:line-clamp={plan.titleLines}
				class:done={task.done}
				title={task.title}
				onclick={(e) => {
					e.stopPropagation();
					if (viewport.phone) goto(`/task/${task.id}`);
					else if (e.ctrlKey || e.metaKey || e.shiftKey) onSelect(e); // selecting several tasks
					else startEdit();
				}}
			>
				{#if task.done && isAbandoned(task)}<span class="pending-mark" title="Abandoned: closed without being done">abandoned</span>{:else if isTaskPending(task)}<span class="pending-mark" title="Pending (on hold)">pending</span>{:else if !task.done && isOngoing(task) && featureShown('ongoing')}<span class="pending-mark ongoing-mark" title="Ongoing">ongoing</span>{/if}{task.title}
			</button>
		{/if}

		<!-- The labels stay in view while the title is edited (19 Nov 2026, Lou #572: a label could
		     not be added before clicking elsewhere; the box went over them). -->
		<div class="labels" bind:this={labelsEl} style:width={plan.labelsW ? `${plan.labelsW}px` : undefined}
			style:max-height="{labelsMaxH}px" use:clickOutside={() => (popover === 'labels' || labelPopoverOpen) && closeAll()}>
			{#each sortedLabels as label (label.id)}
				<button
					class="label-remove"
					title="Click to remove “{label.title}”"
					aria-label="Remove label {label.title}"
					onclick={(e) => {
						e.stopPropagation();
						// On a phone a stray tap must not delete a label: open the task instead.
						if (viewport.phone) goto(`/task/${task.id}`);
						else removeTaskLabel(task.id, label.id);
					}}
				>
					<LabelChip {label} />
				</button>
			{/each}
			{#if plan.cropped}<span class="more" aria-hidden="true">…</span>{/if}
			<div class="prop add-wrap" class:overlay={sortedLabels.length > 0}>
				<button
					class="add-label"
					aria-label="Add label"
					onclick={(e) => {
						e.stopPropagation();
						toggle('labels');
					}}>+</button
				>
			</div>
		</div>
		{#if labelsOpen}
			<div class="anchor left labels-anchor" use:placeVertically style:left="{Math.max(0, Math.min(labelsEl?.offsetLeft ?? 40, mainW - 260))}px">
				<LabelPopover taskId={task.id} assignedLabels={visibleLabels(task.labels)} onClose={closeAll} />
			</div>
		{/if}
	</div>

	<div class="cols" use:clickOutside={() => anyOpen && popover !== 'labels' && closeAll()}>
		<!-- Project -->
		<div class="cell col-project prop">
			<button
				class="chip"
				class:empty={!projectName}
				aria-label="Change project"
				class:multi={projectShown.multi}
				bind:this={projEl}
				bind:clientWidth={projW}
				title={projectRoot && projectName ? `${projectRoot}/${projectName}` : projectName}
				onclick={(e) => {
					e.stopPropagation();
					toggle('project');
				}}
				>{#if projectShown.multi}<span class="p-root">{projectShown.root}</span><span
						class="p-local"
						style:-webkit-line-clamp={rowLines - 1}
						style:line-clamp={rowLines - 1}>{projectShown.local}</span
					>{:else}{projectName ? projectShown.text : '—'}{/if}</button
			>
			{#if moveOpen}
				<div class="anchor" use:placeVertically>
					<ProjectPicker
						onSelect={(p) => moveTaskToProject(task.id, p.id)}
						onNone={async () => {
							const inbox = await getInboxProject();
							if (inbox) await moveTaskToProject(task.id, inbox.id);
						}}
						onClose={closeAll}
					/>
				</div>
			{/if}
		</div>

		{#if !simple}
		<!-- Start date -->
		<div class="cell col-date prop">
			<button
				class="chip"
				class:empty={!hasDate(task.start_date)}
				title="Start date"
				aria-label="Change start date"
				onclick={(e) => {
					e.stopPropagation();
					toggle('start');
				}}>{hasDate(task.start_date) ? shortDate(task.start_date!) : '—'}</button
			>
			{#if popover === 'start'}
				<div class="anchor" use:placeVertically>
					<div class="pop" role="dialog" aria-label="Start date">
						<DateField kind="start" value={task.start_date} onCommit={(iso) => updateTask(task.id, { start_date: iso })} />
						{#if hasDate(task.start_date)}
							<button
								class="btn small clear"
								onclick={() => {
									updateTask(task.id, { start_date: null });
									closeAll();
								}}>Clear date</button
							>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{/if}
		<!-- Due date -->
		<div class="cell col-date prop">
			<button
				class="chip"
				class:overdue={isOverdue}
				class:empty={!hasDate(task.due_date)}
				title="Due date"
				aria-label="Change due date"
				onclick={(e) => {
					e.stopPropagation();
					toggle('due');
				}}>{hasDate(task.due_date) ? shortDate(task.due_date) : '—'}</button
			>
			{#if popover === 'due'}
				<div class="anchor" use:placeVertically>
					<div class="pop" role="dialog" aria-label="Due date">
						<div class="quick">
							{#each quickDates as q (q.label)}
								<button
									class="btn small"
									onclick={() => {
										updateTask(task.id, { due_date: endOfDayIso(q.days) });
										closeAll();
									}}>{q.label}</button
								>
							{/each}
						</div>
						<DateField kind="due" value={task.due_date} onCommit={(iso) => updateTask(task.id, { due_date: iso })} />
						{#if hasDate(task.due_date)}
							<button
								class="btn small clear"
								onclick={() => {
									updateTask(task.id, { due_date: null });
									closeAll();
								}}>Clear date</button
							>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{#if !simple}
		<!-- Links -->
		<div class="cell col-link prop">
			<button
				class="chip"
				class:empty={linkCount === 0}
				title="Linked tasks"
				aria-label="Link tasks"
				onclick={(e) => {
					e.stopPropagation();
					toggle('link');
				}}>{#if linkCount > 0}<Icon name="link" size={13} /> {linkCount}{:else}—{/if}</button
			>
			{#if popover === 'link'}
				<div class="anchor" use:placeVertically>
					<TaskLinkPopover {task} onClose={closeAll} />
				</div>
			{/if}
		</div>

		{/if}
		<!-- Full details -->
		<div class="cell col-icon">
			<button
				class="details"
				title="Open task details"
				aria-label="Open task details"
				onclick={(e) => {
					e.stopPropagation();
					goto(`/task/${task.id}`);
				}}>+</button
			>
		</div>

	</div>
</div>

{#if sheetOpen}<TaskActionSheet {task} onClose={() => (sheetOpen = false)} onSelectMany={onPick ? () => onPick('toggle') : undefined} />{/if}

<style>
	.row.phone {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 40px;
		padding: 4px 8px;
		margin: 0 -8px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
	}
	.row:hover {
		background: var(--bg-elevated);
	}
	.row.dragging {
		opacity: 0.4;
	}
	.row.selected {
		background: var(--bg-elevated);
	}
	/* Selecting several tasks: a tick box on the left of each row (11 Nov 2026) */
	.pick {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		margin-right: -4px;
		border-radius: 5px;
		border: 1.5px solid var(--border-strong);
		background: var(--bg);
		color: #fff;
		display: grid;
		place-items: center;
		padding: 0;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.row:hover .pick,
	.pick:focus-visible,
	.pick.shown {
		opacity: 1;
	}
	.pick:hover {
		border-color: var(--accent);
	}
	.pick.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.row.picked {
		background: color-mix(in srgb, var(--accent) 9%, transparent);
	}
	.row.picked:hover {
		background: color-mix(in srgb, var(--accent) 13%, transparent);
	}
	.row.selecting {
		cursor: default;
	}
	.row.selecting :global(*) {
		cursor: default;
	}
	.row.selecting .pick {
		cursor: pointer;
	}
	.row.phone .pick:not(.shown) {
		display: none;
	}
	.row.phone .pick {
		width: 22px;
		height: 22px;
	}
	.lead {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
	/* The pick buttons of the reviews (15 Nov 2026), in place of the circle: the moon of Tomorrow,
	   the calendar of the Weekly review. Outlined = not chosen, filled round = chosen. Several sit
	   side by side, aligned with the circle of the other rows. */
	.lead {
		gap: 2px;
	}
	.lead :global(.choose) {
		width: 24px;
		height: 24px;
		margin: -3px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text-faint);
		transition: color 0.12s, background 0.12s;
	}
	.lead :global(.choose:hover) {
		color: var(--text);
		background: var(--bg-hover);
	}
	.lead :global(.choose.on) {
		color: var(--bg);
		background: var(--text);
	}
	@media (hover: none), (max-width: 640px) {
		.lead :global(.choose) {
			width: 40px;
			height: 40px;
			margin: -11px -6px -11px -11px;
		}
		.lead :global(.choose.on) {
			background: none;
			color: var(--bg);
		}
		.lead :global(.choose.on svg) {
			background: var(--text);
			border-radius: 50%;
			padding: 4px;
			box-sizing: content-box;
		}
		/* Two picks (Weekly review): one above the other, next to the title. */
		.lead:has(:global(.choose + .choose)) {
			flex-direction: column;
			gap: 0;
		}
		.lead :global(.choose + .choose),
		.lead:has(:global(.choose + .choose)) :global(.choose) {
			height: 34px;
			margin: -6px -6px -6px -11px;
		}
	}
	/* The pick star of the reviews (13 Nov 2026), in place of the circle. */
	.lead :global(.star) {
		width: 22px;
		height: 22px;
		margin: -2px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-size: 17px;
		line-height: 1;
		color: var(--text-faint);
		transition: color 0.12s, transform 0.12s;
	}
	.lead :global(.star:hover) {
		color: var(--text);
		transform: scale(1.15);
	}
	.lead :global(.star.on) {
		color: #f5a623;
	}
	:global(:root[data-mono='1']) .lead :global(.star.on) {
		color: var(--text);
	}
	/* Phones (14 Nov 2026: hard to hit): a bigger star in a 44 px touch area. */
	@media (hover: none), (max-width: 640px) {
		.lead :global(.star) {
			width: 44px;
			height: 44px;
			margin: -12px -10px -12px -12px;
			font-size: 24px;
		}
	}
	.checkbox {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid var(--border-strong);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-2xs);
		color: var(--accent-contrast);
		transition: border-color 0.12s;
	}
	/* Inbox: the validation circle sits at the far right of the row. */
	.checkbox.right {
		order: 99;
	}
	.checkbox:hover {
		border-color: var(--text);
	}
	.checkbox.done {
		background: var(--accent);
		border-color: var(--accent);
	}

	/* Title (at least 5 cm) and its labels share the flexible space. Every label is
	   always shown: when they do not fit on one line they wrap, and the title
	   wraps over the same lines. */
	.main {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.title {
		flex: 1 1 5cm;
		min-width: min(5cm, 100%);
		text-align: left;
		font-size: var(--fs-md);
		line-height: 1.35;
		white-space: normal;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		cursor: text;
	}
	.title.done {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.edit-input {
		flex: 1;
		min-width: 0;
		resize: none;
		overflow: hidden;
		font: inherit;
		font-size: var(--fs-md);
		line-height: 1.4;
		height: auto;
		min-height: 28px;
		padding: 3px 8px;
	}
	.labels {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		flex: 0 1 auto;
		max-width: calc(100% - 5cm - 10px);
		min-width: 0;
		padding: 2px 0;
		overflow: hidden;
	}
	.labels {
		position: relative;
	}
	.labels > .add-wrap.overlay {
		position: absolute;
		right: 0;
		bottom: 2px;
		border-radius: var(--radius);
		pointer-events: none;
	}
	.row:hover .labels > .add-wrap.overlay,
	.row.selected .labels > .add-wrap.overlay {
		background: var(--bg-elevated);
		pointer-events: auto;
	}
	.more {
		position: absolute;
		right: 0;
		bottom: 0;
		padding: 0 4px;
		background: var(--bg);
		color: var(--text-dim);
	}
	.label-remove {
		flex-shrink: 0;
		display: inline-flex;
		border-radius: 999px;
	}
	.label-remove:hover {
		opacity: 0.55;
	}
	.add-label {
		color: var(--text-faint);
		font-size: var(--fs-md);
		padding: 0 6px;
		border-radius: var(--radius);
		opacity: 0;
	}
	.add-label:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.row:hover .add-label,
	.row.selected .add-label {
		opacity: 1;
	}
	@media (hover: none) {
		.add-label {
			opacity: 1;
		}
	}

	/* Fixed-width columns, identical on every row, so everything lines up
	   and a missing value ("—") is easy to spot. */
	.cols {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.cell {
		flex-shrink: 0;
	}
	.col-project {
		width: var(--col-project);
	}
	.col-date {
		width: var(--col-date);
	}
	.col-link {
		width: var(--col-link);
	}
	.col-icon {
		width: var(--col-icon);
		display: flex;
		justify-content: center;
	}
	.prop {
		position: relative;
	}
	.row.pending .title {
		color: var(--text-dim);
		font-style: italic;
	}
	.ongoing-mark {
		color: #00897b;
		border-color: color-mix(in srgb, #00897b 45%, transparent);
	}
		.pending-mark {
		display: inline-block;
		font-style: normal;
		font-size: var(--fs-xs);
		line-height: 1.4;
		color: var(--text-dim);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 4px;
		margin-right: 6px;
		vertical-align: 1px;
	}
	.chip {
		width: 100%;
		text-align: left;
		font-size: var(--fs-xs);
		color: var(--text-dim);
		border-radius: var(--radius);
		padding: 3px 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.chip.multi {
		white-space: normal;
		overflow: hidden;
		text-overflow: clip;
		line-height: 1.3;
		padding-top: 2px;
		padding-bottom: 2px;
	}
	.chip.multi .p-root {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip.multi .p-local {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.chip.empty {
		color: var(--border-strong);
	}
	.chip.empty:hover {
		color: var(--text-dim);
	}
	.chip.overdue {
		color: var(--danger);
		font-weight: 600;
	}

	.anchor {
		position: absolute;
		top: 100%;
		right: 0;
		width: 260px;
		z-index: 50;
	}
	.labels-anchor {
		top: calc(100% - 2px);
	}
	.anchor.left {
		right: auto;
		left: 0;
	}
	.pop {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.narrow-pop {
		flex-direction: row;
		width: max-content;
		margin-left: auto;
	}
	.quick {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.small {
		height: 28px;
		font-size: var(--fs-xs);
		padding: 0 10px;
	}
	.clear {
		color: var(--danger);
	}

	.details {
		width: 22px;
		height: 22px;
		border-radius: var(--radius);
		font-size: 16px;
		line-height: 1;
		color: var(--text-faint);
	}
	.details:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	/* Phone: title on top over the full width, labels wrap beneath it, then one
	   compact line of properties. Empty properties ("—") are hidden. */
	@media (max-width: 760px) {
		.row {
			flex-wrap: wrap;
			align-items: flex-start;
			row-gap: 2px;
			column-gap: 12px;
			padding: 10px 8px;
			min-height: 52px;
		}
		.checkbox {
			width: 22px;
			height: 22px;
			margin-top: 1px;
			position: relative;
		}
		/* Bigger touch target than the drawn circle. */
		.checkbox::after {
			content: '';
			position: absolute;
			inset: -11px;
		}
		.main {
			flex: 1 1 calc(100% - 46px);
			flex-direction: column;
			align-items: stretch;
			gap: 4px;
		}
		.title {
			flex: none;
			min-width: 0;
			font-size: 15px;
			cursor: pointer;
		}
		.labels {
			width: auto !important;
			max-width: 100%;
			max-height: none !important;
			padding: 0;
		}
		.labels:empty,
		.labels:not(:has(.label-remove)) {
			display: none;
		}
		.add-wrap,
		.add-label {
			display: none;
		}
		.cols {
			flex-basis: 100%;
			flex-wrap: wrap;
			padding-left: 34px;
			gap: 2px 6px;
		}
		/* Inbox: the validation circle stays at the right of the title, the
		   properties line goes below both. */
		.row:has(.checkbox.right) .cols {
			padding-left: 0;
			order: 100;
		}
		.cell:has(.chip.empty),
		.col-icon {
			display: none;
		}
		.col-project,
		.col-date,
		.col-link {
			width: auto;
			max-width: calc(100vw - 90px);
		}
		.chip {
			padding: 1px 0;
			pointer-events: none;
		}
		.chip.multi .p-root {
			display: inline;
		}
		.chip.multi .p-root::after {
			content: ' / ';
		}
		.chip.multi .p-local {
			display: inline;
		}
		.cols:not(:has(.cell:not(.col-icon) .chip:not(.empty))) {
			display: none;
		}
	}
</style>
