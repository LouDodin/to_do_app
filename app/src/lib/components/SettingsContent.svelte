<script lang="ts">
	import { appearance } from '../stores/appearance.svelte';
	import type { HelpTab } from '../stores/help.svelte';
	let { tab = 'help' }: { tab?: HelpTab } = $props();
	import { settings } from '../stores/settings.svelte';
	import { logout } from '../api/auth';
	import { goto } from '$app/navigation';
	import { sendAllToInbox, uncompleteAllTasks } from '../actions/tasks';
	import { toastStore } from '../stores/toast.svelte';
	import { buildErrorReport } from '../stores/errorReport';
	import { downloadMyData, lastCopy } from '../stores/dataCopy';
	import { automationStatus, switchAutomations, type AutomationStatus } from '../stores/automations';
	import { validatedMarkInUse } from '../utils/context';
	import Modal from './Modal.svelte';
	import { liveState } from '../db/live.svelte';
	import { db } from '../db/schema';
	import { findDuplicateLabels, findDuplicateProjects, findDuplicateFilters } from '../utils/dedupe';
	import { mergeLabelGroup, mergeProjectGroup, removeDuplicateFilters, convertContextFolders, firstSyncDone, NOT_SYNCED_YET } from '../actions/maintenance';

	import { pwa, promptInstall } from '../pwa.svelte';
	import { installHelp } from '../utils/installHelp';
	import { health, problems, refreshHealth, runHealthCheck, ackWarning, acknowledged, concerns, seenBy } from '../stores/health.svelte';
	import { viewport } from '../stores/viewport.svelte';
	import { onMount } from 'svelte';
	import { alerts, saveTopic, send } from '../alerts/alerts.svelte';

	let topicDraft = $state(alerts.topic);
	$effect(() => {
		topicDraft = alerts.topic;
	});
	let savingTopic = $state(false);
	async function onSaveTopic() {
		savingTopic = true;
		try {
			await saveTopic(topicDraft);
			toastStore.success(topicDraft.trim() ? 'Alerts on: saved for all your devices' : 'Alerts off on all your devices');
		} catch (e) {
			toastStore.error('Saved on this device only (the server could not be reached): ' + (e as Error).message);
		}
		savingTopic = false;
	}
	async function onTest() {
		if (await send('test', topicDraft.trim())) toastStore.success('Test alert sent');
		else toastStore.error('Could not send it: no network?');
	}
	onMount(() => void refreshHealth());
	const issues = $derived(problems());
	let lastCopyAt = $state(lastCopy());
	let auto = $state<AutomationStatus | null | undefined>(undefined);
	let autoError = $state('');
	let switching = $state(false);
	onMount(() => {
		automationStatus()
			.then((s) => (auto = s))
			.catch((e) => {
				auto = null;
				autoError = (e as Error).message;
			});
	});
	async function toggleAuto() {
		if (!auto) return;
		switching = true;
		try {
			auto = await switchAutomations(!auto.on, auto);
			toastStore.success(auto.on ? 'Automations on for your account' : 'Automations off for your account');
		} catch (e) {
			toastStore.error('Could not switch them: ' + (e as Error).message);
		}
		switching = false;
	}
	async function copyData(kind: 'table' | 'complete') {
		try {
			const n = await downloadMyData(kind);
			lastCopyAt = lastCopy();
			toastStore.success(`${n} tasks saved to your downloads`);
		} catch (e) {
			toastStore.error('Could not make the copy: ' + (e as Error).message);
		}
	}
	const acked = $derived(acknowledged());
	let acking = $state('');
	const admin = $derived(!!health.report?.viewer?.admin);
	const me = $derived(health.report?.viewer?.username ?? null);
	async function onAck(name: string, scope: 'me' | 'everyone' = 'me') {
		acking = name;
		const r = await ackWarning(name, scope);
		acking = '';
		if (r.ok) toastStore.success(r.message);
		else toastStore.error(r.message);
	}
	const queued = liveState(() => db.queue.count(), 0);
	const lastPull = liveState(async () => ((await db.meta.get('lastPull'))?.value as number | undefined) ?? 0, 0);
	type Failed = { at: number; entity: string; op: string; status: number; message: string; payload: unknown };
	const failed = liveState(async () => (((await db.meta.get('failedWrites'))?.value as Failed[] | undefined) ?? []), [] as Failed[]);
	function describe(f: Failed): string {
		const p = f.payload as { title?: string } | null;
		return `${f.op} ${f.entity}${p?.title ? ` “${p.title}”` : ''}`;
	}

	const labels = liveState(() => db.labels.toArray(), []);
	const projects = liveState(() => db.projects.toArray(), []);
	const filters = liveState(() => db.filters.toArray(), []);
	const dupLabels = $derived(findDuplicateLabels(labels.value));
	const dupProjects = $derived(findDuplicateProjects(projects.value));
	const dupFilters = $derived(findDuplicateFilters(filters.value, { labelIds: new Set(labels.value.map((l) => l.id)), projectIds: new Set(projects.value.map((p) => p.id)) }));
	let working = $state(false);
	const hasContextFolders = $derived(
		projects.value.some((p) => !p.parent_project_id && ['pro', 'perso'].includes(p.title.trim().toLowerCase()))
	);
	async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
		working = true;
		try {
			const r = await fn();
			r.ok ? toastStore.success(r.message) : toastStore.show(r.message, 'info'); // a warning found is not an app error
		} catch (e) {
			toastStore.error('Merge stopped: ' + (e as Error).message + '. Nothing else was deleted.');
		}
		working = false;
	}

	async function cleanAll() {
		if (!(await firstSyncDone())) return toastStore.error(NOT_SYNCED_YET);
		if (!confirm('Merge every duplicate label, project and identical filter now? The oldest of each is kept.')) return;
		working = true;
		let done = 0, failed: string[] = [];
		for (const g of [...dupLabels]) { const r = await mergeLabelGroup(g).catch((e) => ({ ok: false, message: String(e) })); r.ok ? done++ : failed.push(r.message); }
		for (const g of [...dupProjects]) { const r = await mergeProjectGroup(g).catch((e) => ({ ok: false, message: String(e) })); r.ok ? done++ : failed.push(r.message); }
		for (const g of [...dupFilters.identical]) { const r = await removeDuplicateFilters(g).catch((e) => ({ ok: false, message: String(e) })); r.ok ? done++ : failed.push(r.message); }
		working = false;
		failed.length ? toastStore.error(`${done} merged, ${failed.length} skipped: ${failed[0]}`) : toastStore.success(`${done} groups merged`);
	}

	// Fresh start: duplicates merged, nothing completed, everything back in the Inbox view.
	// A backup file of the current tasks is downloaded first so the state can be restored.
	let fresh = $state(false);
	async function freshStart() {
		if (!(await firstSyncDone())) return toastStore.error(NOT_SYNCED_YET);
		const all = await db.tasks.filter((t) => t.id > 0).toArray();
		const doneCount = all.filter((t) => t.done).length;
		const groups = dupLabels.length + dupProjects.length + dupFilters.identical.length;
		if (
			!confirm(
				`Fresh start:\n• merge ${groups} duplicate group(s)\n• mark ${doneCount} completed task(s) as not completed\n• send all ${all.length} tasks back to the Inbox view\n\nA backup file of your tasks is downloaded first. Continue?`
			)
		)
			return;
		fresh = true;
		try {
			const backup = all.map((t) => ({
				id: t.id,
				title: t.title,
				done: t.done,
				project_id: t.project_id,
				due_date: t.due_date,
				start_date: t.start_date,
				labels: (t.labels ?? []).map((l) => l.title)
			}));
			const a = document.createElement('a');
			a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
			a.download = `tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(a.href);
			let merged = 0;
			const failed: string[] = [];
			const track = (r: { ok: boolean; message: string }) => (r.ok ? merged++ : failed.push(r.message));
			for (const g of [...dupLabels]) track(await mergeLabelGroup(g).catch((e) => ({ ok: false, message: String(e) })));
			for (const g of [...dupProjects]) track(await mergeProjectGroup(g).catch((e) => ({ ok: false, message: String(e) })));
			for (const g of [...dupFilters.identical]) track(await removeDuplicateFilters(g).catch((e) => ({ ok: false, message: String(e) })));
			const un = await uncompleteAllTasks();
			const n = await sendAllToInbox();
			toastStore.success(
				`Fresh start done: ${merged} duplicate group(s) merged, ${un} task(s) reopened, ${n} sent to the Inbox view` +
					(failed.length ? `. ${failed.length} duplicate(s) skipped: ${failed[0]}` : '')
			);
		} catch (e) {
			toastStore.error('Fresh start stopped: ' + (e as Error).message);
		}
		fresh = false;
	}

	let reporting = $state(false);
	let report = $state('');
	async function copyReport() {
		try {
			await navigator.clipboard.writeText(report);
			toastStore.success('Copied: paste it to Claude');
		} catch {
			toastStore.show('Copy blocked by the browser: select the text and copy it');
		}
	}
	async function makeReport() {
		reporting = true;
		try {
			report = await buildErrorReport(30, {
				queued: queued.value,
				refused: failed.value.map((f) => `${new Date(f.at).toLocaleString('en-GB')}: ${describe(f)} — ${f.message} (${f.status})`),
				statusV2: validatedMarkInUse()
			});
			await copyReport();
		} finally {
			reporting = false;
		}
	}
	function downloadReport() {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }));
		a.download = `tasks-error-report-${new Date().toISOString().slice(0, 10)}.md`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
	let checking = $state(false);
	async function checkNow() {
		checking = true;
		const r = await runHealthCheck();
		checking = false;
		r.ok ? toastStore.success(r.message) : toastStore.show(r.message, 'info'); // a warning found is not an app error
	}
	const dupCount = $derived(dupLabels.length + dupProjects.length + dupFilters.identical.length + dupFilters.conflicting.length);
	const when = (d: number | string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

	// Keyboard shortcuts (computer only): the essentials, two columns.
	const keys: [string, string][] = [
		['n', 'New task'],
		['/ or Ctrl+K', 'Search'],
		['g h · g i · g p', 'Home · Inbox · Shopping'],
		['g t · g w · g b', 'Tomorrow · Weekly · Bin'],
		['? · g u · g s', 'Help · Updates · Settings'],
		['↑ ↓ or k j', 'Move in a list'],
		['Enter or o', 'Open the task'],
		['x or Space', 'Complete'],
		['r · l · m', 'Rename · Labels · Move'],
		['v', 'Validate (Inbox)'],
		['1 · 2', 'Set Pro · Perso (Inbox)'],
		['Backspace', 'Move to the Bin'],
		['Ctrl/⌘+click · Shift+click', 'Select several tasks'],
		['Ctrl/⌘+Z · Ctrl/⌘+Shift+Z', 'Undo · Redo'],
		['Esc', 'Close or go back']
	];
	// Install (29 Oct 2026): always offered while the app is not installed, on phones too. Chrome,
	// Edge and Brave open their own Install window; other browsers get their steps.
	const howTo = typeof navigator === 'undefined' ? null : installHelp(navigator.userAgent, navigator.maxTouchPoints ?? 0);
	let showSteps = $state(false);
	async function onInstall() {
		if (pwa.canInstall) {
			if (await promptInstall()) toastStore.success('Installed: open Tasks from its icon from now on');
		} else showSteps = !showSteps;
	}
</script>

<div class="settings-content">
	<!-- 10 Nov 2026: one content per tab of the Help centre (Updates has its own component). -->
	{#if tab === 'help'}
	{#if !pwa.installed && howTo}
		<section class="install">
			<h2>Install the app</h2>
			<div class="row">
				<button class="btn btn-primary" onclick={onInstall}>{pwa.canInstall ? 'Install the app' : showSteps ? 'Hide the steps' : 'Install the app'}</button>
			</div>
			{#if showSteps && !pwa.canInstall}
				<div class="steps-box">
					<p class="small dim">In {howTo.where}:</p>
					{#if howTo.steps.length}
						<ol>
							{#each howTo.steps as st (st)}<li>{st}</li>{/each}
						</ol>
					{/if}
					{#if howTo.note}<p class="small dim">{howTo.note}</p>{/if}
				</div>
			{/if}
		</section>
	{/if}
	<section>
		<h2>How the app is organised</h2>
		<dl class="map">
			<dt>Top bar</dt>
			<dd>Left: <b>☰</b> the menu, <b>Home</b>, <b>All</b> <b>Pro</b> <b>Perso</b> (what the home page and the menu show){viewport.phone ? '' : ', back and forward'}. Middle: <b>Search</b>. Right: undo{viewport.phone ? '' : ', redo, + New task'} and <b>?</b> this Help centre.{#if viewport.phone}{' '}New task: the round <b>+</b> at the bottom.{/if}</dd>
			<dt>☰ Menu</dt>
			<dd>Every place: Inbox, Shopping, Upcoming, Tomorrow, Weekly review, Bin, then your projects, filters and labels (each with its +). Click a heading to fold it.</dd>
			<dt>A page</dt>
			<dd>Its title, its own buttons at the top right, then its tasks. Click a task’s circle to complete it, the <b>+</b> at the end of its row to open it.</dd>
			<dt>? Help centre</dt>
			<dd>Everything about the app itself: <b>Help</b>, <b>Updates</b> (what changed, searchable), <b>Status</b> (server, sync, warnings, error report) and <b>Settings</b>.</dd>
		</dl>
	</section>

	<section>
		<h2>User guide</h2>
		<div class="row"><a class="btn btn-outline" href="/guide/guide.html" target="_blank" rel="noopener">Open the user guide</a></div>
	</section>

	{#if !viewport.phone}
		<section>
			<h2>Keyboard</h2>
			<div class="keys">
				{#each keys as [k, d] (k)}
					<div class="key"><kbd>{k}</kbd><span>{d}</span></div>
				{/each}
			</div>
		</section>
	{:else}
		<section>
			<h2>New task icon</h2>
			<p class="hint">The round + button.</p>
		</section>
	{/if}

	{:else if tab === 'status'}
	<section>
		<h2>Status</h2>
		<dl class="facts">
			<dt>Server</dt>
			<dd>
				{#if health.reachable === null}checking…{:else if health.reachable}<span class="dot ok"></span>online{:else}<span class="dot bad"></span>unreachable: changes wait on this device{/if}
			</dd>
			<dt>Sync</dt>
			<dd>{lastPull.value ? when(lastPull.value) : 'never'}{queued.value ? ` · ${queued.value} change${queued.value > 1 ? 's' : ''} waiting` : ''}</dd>
			<dt>Health</dt>
			<dd>
				{#if !health.report}no report yet{:else if issues.length === 0}<span class="dot ok"></span>all {health.report.checks.length} checks OK{:else}<span class="dot" class:bad={issues.some((c) => c.status === 'fail')} class:warn={!issues.some((c) => c.status === 'fail')}></span>{issues.length} problem{issues.length > 1 ? 's' : ''}{/if}
				{#if health.report}<span class="dim"> · {when(health.report.generated)}</span>{/if}
			</dd>
		</dl>
		{#each issues as c (c.name)}
			<div class="issue" class:fail={c.status === 'fail'}>
				<strong>{c.name}</strong>{#if c.detail}: {c.detail}{/if}
				{#if c.fix}<div class="fix">{c.fix}</div>{/if}
				{#if admin}
					<div class="who">
						<span>Seen by: <b>{seenBy(c, me)}</b></span>
					</div>
				{/if}
				{#if admin && !c.local}
					<div class="who">
						<span>Concerns: <b>{concerns(c, me)}</b></span>
						{#if c.cause?.length}<span>Cause: {c.cause.join(', ')}</span>{/if}
					</div>
				{/if}
				{#if c.status === 'warn' && !c.local}
					<div class="acks">
						<button class="ack" disabled={acking === c.name} onclick={() => onAck(c.name, 'me')} title="Hide it for you">{acking === c.name ? '…' : admin && c.account !== me ? 'Got it (just me)' : 'Got it'}</button>
						{#if admin && c.account !== me}
							<button class="ack" disabled={acking === c.name} onclick={() => onAck(c.name, 'everyone')} title="Hide it for everyone">Got it (everyone)</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if acked.length}
			<p class="acked">Acknowledged: {acked.map((c) => (admin ? `${c.name} (${c.ack_scope === 'everyone' ? 'for everyone' : 'just you'})` : c.name)).join(', ')}.</p>
		{/if}
		{#each failed.value as f (f.at)}
			<div class="issue fail">Refused by the server: {describe(f)} — {f.message} ({f.status})</div>
		{/each}
		<div class="row">
			<button class="btn btn-outline" disabled={checking} onclick={checkNow}>{checking ? 'Checking… (up to a minute)' : 'Run a health check'}</button>
			{#if failed.value.length}<button class="btn btn-outline" onclick={() => db.meta.delete('failedWrites')}>Clear refused changes</button>{/if}
		</div>
	</section>

	<section>
		<h2>Error report</h2>
		<div class="row">
			<button class="btn btn-outline" disabled={reporting} onclick={makeReport}>{reporting ? 'Gathering…' : 'Error report (30 days)'}</button>
			{#if toastStore.errors.length}<span class="dim small">{toastStore.errors.length} error(s) seen on this device</span>{/if}
		</div>
	</section>

	{:else}
	<section>
		<h2>Alerts</h2>
		<div class="row">
			<input class="input" type="text" placeholder="ntfy topic (empty: no alerts)" autocomplete="off" spellcheck="false" bind:value={topicDraft} />
			<button class="btn" disabled={savingTopic || topicDraft.trim() === alerts.topic} onclick={onSaveTopic}>Save</button>
			<button class="btn btn-outline" disabled={!topicDraft.trim()} onclick={onTest}>Test</button>
		</div>
	</section>

	<section>
		<h2>Automations</h2>
		{#if auto === undefined}
			<p class="dim small">Checking…</p>
		{:else if auto === null}
			<p class="dim small">The PC cannot tell right now{autoError ? ` (${autoError})` : ''}.</p>
		{:else}
			<div class="row">
				<span><span class="dot" class:ok={auto.on}></span>{auto.on ? 'On' : 'Off'}{auto.main ? ' (main account, managed on the PC)' : ''}{auto.on && auto.last_cycle ? ` · last run ${when(auto.last_cycle)}` : auto.on ? ' · first run within a minute' : ''}</span>
				{#if !auto.main}
					<button class="btn {auto.on ? 'btn-outline' : ''}" disabled={switching} onclick={toggleAuto}>{switching ? '…' : auto.on ? 'Turn off' : 'Turn on'}</button>
				{/if}
			</div>
			{#if auto.errors.length}<div class="issue">Problems in the last 12 h: {auto.errors.join(' | ')}</div>{/if}
		{/if}
	</section>

	<section>
		<h2>My data</h2>
		<div class="row">
			<button class="btn btn-outline" onclick={() => copyData('table')}>Download a table (Excel)</button>
			<button class="btn btn-outline" onclick={() => copyData('complete')}>Download everything</button>
			<span class="dim small">{lastCopyAt ? `Last copy: ${when(lastCopyAt)}` : 'No copy yet'}</span>
		</div>
	</section>


	<section class="appearance">
		<h2>Appearance <span class="dim small">(this device)</span></h2>
		<div class="seg" role="group" aria-label="Theme">
			{#each [['light', 'Light'], ['black', 'Black'], ['auto', 'Like the device']] as const as [v, name] (v)}
				<button aria-pressed={appearance.theme === v} class:on={appearance.theme === v} onclick={() => appearance.set(v)}>{name}</button>
			{/each}
		</div>
		<label class="mono-row"><input type="checkbox" checked={appearance.mono} onchange={(e) => appearance.set(appearance.theme, (e.target as HTMLInputElement).checked)} /> Labels in shades of grey</label>
	</section>

	<section>
		<h2>Label colours</h2>
		<details class="colours">
			<summary>Order of the colours</summary>
		<div class="color-list">
			{#each settings.colorOrder as color, i (color)}
				<div class="color-row">
					<span class="swatch" style="background: #{color}"></span>
					<span class="hex">#{color}</span>
					<button class="btn-icon" disabled={i === 0} onclick={() => settings.moveColor(i, -1)} aria-label="Up">↑</button>
					<button class="btn-icon" disabled={i === settings.colorOrder.length - 1} onclick={() => settings.moveColor(i, 1)} aria-label="Down">↓</button>
				</div>
			{/each}
		</div>

		</details>
	</section>

	<details class="tools">
		<summary>Maintenance{dupCount ? ` · ${dupCount} duplicate${dupCount > 1 ? 's' : ''}` : ''}</summary>

		<h3>Duplicates</h3>
		{#if dupCount === 0}
			<p class="hint">None.</p>
		{:else}
			{#if dupLabels.length + dupProjects.length + dupFilters.identical.length > 1}
				<button class="btn" disabled={working} onclick={cleanAll}>Merge all</button>
			{/if}
			{#each dupLabels as g (g.keep.id)}
				<div class="dup"><span>Label "{g.keep.title}" ×{g.remove.length + 1}</span>
					<button class="btn btn-outline" disabled={working} onclick={() => run(() => mergeLabelGroup(g))}>Merge</button></div>
			{/each}
			{#each dupProjects as g (g.keep.id)}
				<div class="dup"><span>Project "{g.keep.title}" ×{g.remove.length + 1}</span>
					<button class="btn btn-outline" disabled={working} onclick={() => run(() => mergeProjectGroup(g))}>Merge</button></div>
			{/each}
			{#each dupFilters.identical as g (g.keep.id)}
				<div class="dup"><span>Filter "{g.keep.title}" ×{g.remove.length + 1}</span>
					<button class="btn btn-outline" disabled={working} onclick={() => run(() => removeDuplicateFilters(g))}>Remove extras</button></div>
			{/each}
			{#each dupFilters.conflicting as g (g[0].id)}
				<div class="dup"><span>Filter "{g[0].title}" ×{g.length}, different definitions: rename or delete one by hand.</span></div>
			{/each}
		{/if}

		{#if hasContextFolders}
			<h3>Pro and Perso folders</h3>
			<p class="hint">Turns the old Pro and Perso folders into the project setting.</p>
			<button class="btn" disabled={working} onclick={() => confirm('Convert the Pro and Perso folders into settings now?') && run(convertContextFolders)}>Convert</button>
		{/if}

		<h3>Fresh start</h3>
		<p class="hint">Reopens everything and sends it back to the Inbox (a backup is downloaded first).</p>
		<button class="btn btn-outline danger" disabled={fresh} onclick={freshStart}>{fresh ? 'Working…' : 'Fresh start'}</button>
	</details>


	<section class="foot">
		<h2>Account</h2>
		<button
			class="btn btn-outline"
			onclick={() => {
				logout();
				goto('/login');
			}}>Sign out</button
		>
		<p class="hint">
			Build {__APP_BUILD__}{pwa.swActive ? ' · works offline' : ''}{health.serverVersion ? ` · Vikunja ${health.serverVersion}` : ''}
		</p>
	</section>
	{/if}

	{#if report}
		<Modal title="Error report" wide onClose={() => (report = '')}>
			<p class="hint">Copied.</p>
			<textarea class="report" readonly value={report}></textarea>
			<div class="row">
				<button class="btn btn-primary" onclick={() => copyReport()}>Copy again</button>
				<button class="btn btn-outline" onclick={downloadReport}>Download (.md)</button>
			</div>
		</Modal>
	{/if}

</div>

<style>
	.steps-box {
		margin-top: 10px;
		padding: 10px 12px;
		border-radius: var(--radius);
		background: var(--bg-hover);
	}
	.steps-box ol {
		margin: 4px 0 6px;
		padding-left: 20px;
	}
	.steps-box li {
		margin-bottom: 4px;
	}
	.steps-box p {
		margin: 0;
	}
	section {
		margin-bottom: 22px;
	}
	h2 {
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-dim);
		margin: 0 0 8px;
	}
	h3 {
		font-size: var(--fs-sm);
		font-weight: 600;
		margin: 16px 0 4px;
	}
	.hint {
		font-size: var(--fs-xs);
		color: var(--text-dim);
		margin: 0 0 8px;
	}
	.dim {
		color: var(--text-faint);
	}
	.colours summary {
		cursor: pointer;
		font-size: var(--fs-sm);
		color: var(--text-dim);
		margin-bottom: 6px;
	}
	.map {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 14px;
		margin: 0;
		font-size: var(--fs-sm);
		line-height: 1.45;
	}
	.map dt {
		font-weight: 600;
		white-space: nowrap;
	}
	.map dd {
		margin: 0;
		color: var(--text-dim);
	}
	@media (max-width: 520px) {
		.map {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		.map dd {
			margin-bottom: 8px;
		}
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 14px;
		margin: 0 0 10px;
		font-size: var(--fs-sm);
	}
	.facts dt {
		color: var(--text-dim);
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 6px;
		background: var(--text-faint);
	}
	.dot.ok {
		background: #22c55e;
	}
	.dot.warn {
		background: #f59e0b;
	}
	.dot.bad {
		background: var(--danger);
	}
	.issue {
		font-size: var(--fs-sm);
		padding: 8px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		margin-bottom: 6px;
	}
	.issue.fail {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
	}
	.issue .ack {
		margin-top: 6px;
		font-size: var(--fs-xs);
		padding: 3px 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--bg);
	}
	.issue .acks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.issue .who {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 12px;
		margin-top: 4px;
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
	.issue .ack:hover {
		background: var(--bg-hover);
	}
	.acked {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		margin: 0 0 8px;
	}
	.issue .fix {
		color: var(--text-dim);
		font-size: var(--fs-xs);
		margin-top: 2px;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.row .input {
		flex: 1 1 200px;
		min-width: 0;
	}
	.report {
		width: 100%;
		min-height: 320px;
		max-height: 55vh;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--fs-xs);
		margin-bottom: 8px;
	}
	.small {
		font-size: var(--fs-xs);
	}
	.errors {
		max-height: 260px;
		overflow: auto;
		margin-bottom: 8px;
	}
	.keys {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px 16px;
	}
	.key {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: var(--fs-sm);
		color: var(--text-dim);
	}
	kbd {
		flex: none;
		min-width: 92px;
		padding: 2px 6px;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--fs-xs);
		color: var(--text);
		text-align: center;
	}
	.tools {
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		padding: 10px 0;
		margin-bottom: 18px;
	}
	.tools summary {
		cursor: pointer;
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-dim);
	}
	.tools[open] summary {
		margin-bottom: 4px;
	}
	.dup {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-sm);
	}
	.color-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 260px;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: none;
	}
	.hex {
		flex: 1;
		font-family: monospace;
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
	.danger {
		color: var(--danger);
	}
	.foot {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	@media (max-width: 760px) {
		.keys {
			grid-template-columns: 1fr;
		}
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		padding: 2px;
		gap: 2px;
	}
	.seg button {
		padding: 4px 12px;
		border-radius: 999px;
		font-size: var(--fs-sm);
		color: var(--text-dim);
	}
	.seg button.on {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.mono-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		font-size: var(--fs-sm);
	}
</style>
