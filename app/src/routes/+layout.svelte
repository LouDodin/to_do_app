<script lang="ts">
	import { areaFilter } from '../lib/stores/areaFilter.svelte';
	import { shown, loadFeatures, PAGE_PATHS, type Feature } from '../lib/stores/features.svelte';
	import Icon from '../lib/components/Icon.svelte';
	import '../lib/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { appearance } from '../lib/stores/appearance.svelte';
	import { remindIfDue } from '../lib/stores/dataCopy';
	import { automationsOnByDefault } from '../lib/stores/automations';
	import { initDayPlan } from '../lib/stores/dayPlan.svelte';
	import { watchSections } from '../lib/stores/sectionSync';
	import { initErrorReport } from '../lib/stores/errorReport';
	import { goto, afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { syncOverlays, openOverlay, closeOverlay } from '../lib/stores/overlays.svelte';
	import { isConfigured } from '../lib/api/config';
	import { initSync } from '../lib/db/sync';
	import { initPwa, pwa } from '../lib/pwa.svelte';
	import { initHealth, health, problems } from '../lib/stores/health.svelte';
	import { initAlerts } from '../lib/alerts/alerts.svelte';
	import LeftPanel from '../lib/components/LeftPanel.svelte';
	import { helpStore } from '../lib/stores/help.svelte';
	import ViewSwitcher from '../lib/components/ViewSwitcher.svelte';
	import CaptureModal from '../lib/components/CaptureModal.svelte';
	import SearchBar from '../lib/components/SearchBar.svelte';
	import SyncIndicator from '../lib/components/SyncIndicator.svelte';
	import HelpCentre from '../lib/components/HelpCentre.svelte';
	import ToastHost from '../lib/components/ToastHost.svelte';
	import WhatsNew from '../lib/components/WhatsNew.svelte';
	import { news } from '../lib/news.svelte';
	import BulkBar from '../lib/components/BulkBar.svelte';
	import { multiSelect } from '../lib/stores/multiSelect.svelte';
	import { noAutofill } from '../lib/utils/noAutofill';
	import { toastStore } from '../lib/stores/toast.svelte';
	import { history as undoHistory, undo, redo } from '../lib/stores/history.svelte';

	let { children } = $props();

	// Back gesture / back button: close the window opened last instead of leaving the page.
	$effect(() => {
		syncOverlays((page.state as { overlay?: number }).overlay);
	});

	// On a phone the side panels are drawers: the back gesture closes them too.
	let drawerOverlay: number | null = null;
	$effect(() => {
		const drawerOpen = narrow && leftOpen;
		if (drawerOpen && drawerOverlay === null) {
			drawerOverlay = openOverlay(() => {
				drawerOverlay = null;
				leftOpen = false;
			});
		} else if (!drawerOpen && drawerOverlay !== null) {
			const id = drawerOverlay;
			drawerOverlay = null;
			closeOverlay(id);
		}
	});

	// Remembered across reloads (like every other app with collapsible
	// panels) rather than always reopening both on every visit.
	function readStoredOpen(key: string): boolean {
		try {
			const v = localStorage.getItem(key);
			return v === null ? true : v === '1';
		} catch {
			return true;
		}
	}
	function writeStoredOpen(key: string, value: boolean) {
		try {
			localStorage.setItem(key, value ? '1' : '0');
		} catch {
			// Storage unavailable (private browsing, etc.) — just don't persist.
		}
	}

	// Panel widths are draggable down to the window edge (no minimum width); it
	// can never grow beyond the maximum.
	const MIN_W = 0;
	const MAX_W = 420;
	const CLOSE_W = 6;
	let leftW = $state(252);
	function clampW(w: number) {
		return Math.max(MIN_W, Math.min(MAX_W, w));
	}
	function readW(key: string): number {
		try {
			const v = Number(localStorage.getItem(key));
			return v ? clampW(v) : 252;
		} catch {
			return 252;
		}
	}
	function startResize(e: PointerEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = leftW;
		const move = (ev: PointerEvent) => {
			const raw = startW + ev.clientX - startX;
			if (raw < CLOSE_W) {
				leftOpen = false;
				writeStoredOpen('panel:left', false);
				stop();
				return;
			}
			leftW = clampW(raw);
		};
		const stop = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			document.body.style.userSelect = '';
			document.body.style.cursor = '';
			try {
				localStorage.setItem('panel:leftW', String(leftW));
			} catch {
				// not persisted
			}
		};
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'col-resize';
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
	}

	// A closed panel can be pulled back in by grabbing the window edge and sliding inwards.
	function grabEdge(e: PointerEvent) {
		e.preventDefault();
		let moved = false;
		const move = (ev: PointerEvent) => {
			const raw = ev.clientX;
			if (raw < 24 && !moved) return;
			moved = true;
			if (raw < CLOSE_W) return;
			leftW = clampW(raw);
			leftOpen = true;
		};
		const stop = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			document.body.style.userSelect = '';
			if (!moved) leftOpen = true;
			writeStoredOpen('panel:left', leftOpen);
			try {
				localStorage.setItem('panel:leftW', String(leftW));
			} catch {
				// not persisted
			}
		};
		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
	}

	let leftOpen = $state(true);
	let ready = $state(false);
	let showCapture = $state(false);

	// On a phone-sized screen the panels are drawers laid over the page, so
	// they start closed (whatever was stored from a desktop session) and
	// close again after every navigation.
	let narrow = $state(false);
	let startW = $state(0);
	let endW = $state(0);
	// The search bar is centred over the page: right of the menu when open, never under the buttons.
	const searchLeft = $derived(Math.max(!narrow && leftOpen ? leftW : 0, startW + 20));
	const searchRight = $derived(endW + 20);

	afterNavigate((nav) => {
		if (narrow) leftOpen = false;
		// Going to another page closes the Help centre (a link or g + a letter from inside it).
		if (nav.type !== 'enter') helpStore.open = false;
	});

	onMount(() => noAutofill());
	// Pages and features of this account (Settings): the device's choice at once, then the account's.
	onMount(() => void loadFeatures());
	// Without the All / Pro / Perso switch, everything is shown.
	$effect(() => {
		if (!shown('area-switch') && areaFilter.area !== 'all') areaFilter.set('all');
	});
	onMount(() => appearance.init());
	onMount(() => {
		initPwa();
		const mq = window.matchMedia('(max-width: 760px)');
		narrow = mq.matches;
		mq.addEventListener('change', (e) => {
			narrow = e.matches;
			if (e.matches) leftOpen = false;
		});
		leftW = readW('panel:leftW');
		leftOpen = narrow ? false : readStoredOpen('panel:left');
		// The capture window has its own small sign-in form.
		if (!isConfigured() && !page.url.pathname.startsWith('/login') && !page.url.pathname.startsWith('/quick-add')) {
			goto('/login');
		}
		if (isConfigured()) {
			initSync();
			initHealth();
		}
		initAlerts(); // also when signed out: that is one of the things it reports
		initErrorReport();
		setTimeout(() => remindIfDue(() => helpStore.show('settings')), 20_000);
		setTimeout(() => void automationsOnByDefault(), 15_000);
		initDayPlan();
		watchSections();
		ready = true;
	});

	// SvelteKit doesn't expose "can I go forward?", so we track our own
	// position in the session history: link/goto navigations push (and
	// discard any forward entries); back/forward arrive as 'popstate' with
	// a delta. A full reload resets the counters, which is fine.
	let histPos = $state(0);
	let histMax = $state(0);
	afterNavigate((nav) => {
		if (nav.type === 'enter') return;
		if (nav.type === 'popstate') {
			histPos = Math.max(0, Math.min(histMax, histPos + (nav.delta ?? 0)));
		} else if (nav.type === 'link' || nav.type === 'goto') {
			histPos += 1;
			histMax = histPos;
		}
	});
	const canGoBack = $derived(histPos > 0);
	const canGoForward = $derived(histPos < histMax);
	const isHome = $derived(page.url.pathname === '/');

	// Only one drawer at a time on a narrow screen; on desktop the choice
	// is remembered across reloads.
	function toggleLeft() {
		leftOpen = !leftOpen;
		if (!narrow) writeStoredOpen('panel:left', leftOpen);
	}

	// The quick-add capture windows (spec "Raccourcis globaux") are meant to
	// be bare, minimal windows — no sidebars, no chrome — opened by an OS
	// shortcut, so the shell is skipped entirely for that route.
	const isCaptureRoute = $derived(page.url.pathname.startsWith('/quick-add'));
	const healthIssues = $derived(problems());
	// A dot on ? while this device has updates it has not shown yet.
	const newsUnseen = $derived(news.unseen > 0);
	const isLoginRoute = $derived(page.url.pathname.startsWith('/login'));

	// "g" then a letter jumps to a page (g h home, g i Inbox, g p Shopping, g t Tomorrow, g c Upcoming (13 Nov 2026), g w Weekly,
	// g b Bin); g u and g s open the Help centre on Updates and Settings.
	const jumps: Record<string, string> = { h: '/', i: '/inbox', p: '/shopping', t: '/today-review', c: '/upcoming', w: '/weekly', b: '/bin' };
	let gAt = 0;
	async function doUndo() {
		const what = await undo();
		if (what) toastStore.success(`Undone: ${what}`);
	}
	async function doRedo() {
		const what = await redo();
		if (what) toastStore.success(`Redone: ${what}`);
	}
	function handleGlobalKeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
		// Undo / redo (5 Nov 2026): Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y. Inside a text box they
		// keep their usual meaning (undo typing).
		if (!typing && (e.metaKey || e.ctrlKey) && !e.altKey && (e.key.toLowerCase() === 'z' || (e.key.toLowerCase() === 'y' && e.ctrlKey))) {
			e.preventDefault();
			if (e.key.toLowerCase() === 'y' || e.shiftKey) void doRedo();
			else void doUndo();
			return;
		}
		if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
			if (gAt && Date.now() - gAt < 1200 && (e.key === 'u' || e.key === 's')) {
				e.preventDefault();
				gAt = 0;
				helpStore.show(e.key === 'u' ? 'updates' : 'settings');
				return;
			}
			if (gAt && Date.now() - gAt < 1200 && jumps[e.key] && !Object.entries(PAGE_PATHS).some(([f, path]) => path === jumps[e.key] && !shown(f as Feature))) {
				e.preventDefault();
				gAt = 0;
				goto(jumps[e.key]);
				return;
			}
			gAt = e.key === 'g' ? Date.now() : 0;
			if (e.key === 'g') return;
			if (e.key === '/') {
				e.preventDefault();
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
				return;
			}
		}
		if ((e.key === 'n' || e.key === 'c') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !showCapture) {
			e.preventDefault();
			showCapture = true;
			return;
		}
		if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
			e.preventDefault();
			helpStore.show();
		}
	}
	// Where you are going: if that page belongs to an older version that is gone, the app opens it
	// fresh instead of showing an error (hooks.client.ts).
	beforeNavigate(({ to }) => {
		(window as unknown as { __navTarget?: string }).__navTarget = to?.url.href;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if isCaptureRoute || isLoginRoute}
	{@render children()}
{:else if ready}
	<div class="shell">
		<!-- The top bar holds what works everywhere (10 Nov 2026): on the left where you are (menu,
		     Home, the view, back and forward), search in the middle, and on the right what you do
		     (undo, redo, new task) and the Help centre. Places are in the menu; the app itself is under ?. -->
		<header class="topbar">
			<div class="zone start" bind:clientWidth={startW}>
				<button
					class="btn nav-icon-btn"
					class:active={leftOpen}
					onclick={toggleLeft}
					aria-label="Menu: places, projects, filters and labels"
					title="Menu: places, projects, filters and labels">☰</button
				>
				<a href="/" class="btn nav-icon-btn" class:active={isHome} aria-label="Go to home page" title="Home (g h)" aria-current={isHome ? 'page' : undefined}><Icon name="home" /></a>
				{#if shown('area-switch')}<ViewSwitcher />{/if}
				<button
					class="btn nav-icon-btn hide-narrow"
					onclick={() => history.back()}
					disabled={!canGoBack}
					aria-label="Go back">←</button
				>
				<button
					class="btn nav-icon-btn hide-narrow"
					onclick={() => history.forward()}
					disabled={!canGoForward}
					aria-label="Go forward">→</button
				>
			</div>
			<div class="search-slot" style:left="{searchLeft}px" style:right="{searchRight}px"><div class="search-inner"><SearchBar /></div></div>
			<div class="zone end" bind:clientWidth={endW}>
				<button class="sync-slot" onclick={() => helpStore.show('status')} aria-label="Sync status: open Status" title="Status"><SyncIndicator /></button>
				{#if undoHistory.undo.length}
					<button class="btn nav-icon-btn" onclick={doUndo} disabled={undoHistory.busy} aria-label="Undo" title="Undo: {undoHistory.undo.at(-1)?.label} (Ctrl/⌘+Z)"><Icon name="undo" /></button>
				{/if}
				{#if undoHistory.redo.length}
					<button class="btn nav-icon-btn hide-narrow" onclick={doRedo} disabled={undoHistory.busy} aria-label="Redo" title="Redo: {undoHistory.redo.at(-1)?.label} (Ctrl/⌘+Shift+Z)"><Icon name="redo" /></button>
				{/if}
				<button class="btn nav-icon-btn hide-narrow" onclick={() => (showCapture = true)} aria-label="New task" title="New task (n)">+</button>
				<button class="btn nav-icon-btn help-btn" onclick={() => helpStore.show()} aria-label="Help and settings" title="Help centre: help, updates, status, settings (?)"
					>?{#if healthIssues.length}<span class="badge" class:warn={!healthIssues.some((c) => c.status === 'fail')}></span>{:else if newsUnseen}<span class="badge news"></span>{/if}</button
				>
			</div>
		</header>
		{#if healthIssues.length && health.dismissed !== health.report?.generated}
			{@const worst = healthIssues.find((c) => c.status === 'fail') ?? healthIssues[0]}
			<!-- Same words as the phone alerts: "problem" (red, act today), "warning" (orange). -->
			<div class="health-banner" class:warn={worst.status !== 'fail'} role="alert">
				<button class="link" onclick={() => helpStore.show('status')}>Server {worst.status === 'fail' ? 'problem' : 'warning'}: {worst.name}{healthIssues.length > 1 ? ` (+${healthIssues.length - 1})` : ''}</button>
				<button class="x" aria-label="Hide" onclick={() => (health.dismissed = health.report?.generated ?? '')}>×</button>
			</div>
		{/if}
		<div class="body">
			{#if narrow && leftOpen}
				<button class="scrim" aria-label="Close panel" onclick={() => (leftOpen = false)}></button>
			{/if}
			{#if !narrow && !leftOpen}
				<div class="edge left" role="separator" aria-label="Drag to open the menu" onpointerdown={grabEdge}></div>
			{/if}
			{#if leftOpen}
				<aside class="side left" style:width={narrow ? undefined : `${leftW}px`}>
					<LeftPanel />
				</aside>
				{#if !narrow}
					<div class="resizer" role="separator" aria-orientation="vertical" onpointerdown={startResize}></div>
				{/if}
			{/if}
			<main class="content scroll-y">
				{@render children()}
			</main>
			{#if narrow && !showCapture && !leftOpen && !multiSelect.ids.length}
				<!-- Phone: the new-task button sits where the thumb is. -->
				<button class="fab" onclick={() => (showCapture = true)} aria-label="New task">+</button>
			{/if}
		</div>
	</div>
{/if}

{#if showCapture}
	<CaptureModal onClose={() => (showCapture = false)} />
{/if}

{#if helpStore.open}
	<HelpCentre onClose={() => (helpStore.open = false)} />
{/if}



{#if pwa.updated}
	<div class="update-banner" role="status">
		A new version of the app is ready.
		<button class="btn small-btn" onclick={() => location.reload()}>Reload</button>
	</div>
{/if}

<ToastHost />
{#if ready && isConfigured() && !page.url.pathname.startsWith('/quick-add') && !page.url.pathname.startsWith('/login')}<WhatsNew />{/if}
<BulkBar />

<style>
	.edge {
		position: fixed;
		top: 48px;
		bottom: 0;
		width: 10px;
		z-index: 30;
		cursor: col-resize;
	}
	.edge.left {
		left: 0;
	}
	.edge:hover {
		background: color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		/* Mobile browsers: the visible height, without the address bar. */
		height: 100dvh;
	}
	/* A slim bar under the top bar (in the page flow: it never covers anything). */
	.health-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 4px 8px 4px 12px;
		background: color-mix(in srgb, var(--danger) 9%, var(--bg));
		border-bottom: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		font-size: var(--fs-xs);
		flex-shrink: 0;
	}
	.health-banner .link { color: var(--danger); font-weight: 600; font-size: inherit; }
	.health-banner .link:hover { text-decoration: underline; }
	.health-banner.warn { background: color-mix(in srgb, #f59e0b 10%, var(--bg)); border-bottom-color: color-mix(in srgb, #f59e0b 30%, transparent); }
	.health-banner.warn .link { color: #b26a00; }
	.health-banner .x { width: 22px; height: 22px; border-radius: 50%; color: var(--text-dim); }
	.update-banner {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(16px + env(safe-area-inset-bottom, 0px));
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 8px 8px 14px;
		background: var(--accent);
		color: var(--accent-contrast);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.small-btn {
		height: 28px;
		background: var(--accent-contrast);
		color: var(--accent);
	}
	.fab {
		position: fixed;
		right: 18px;
		bottom: calc(18px + env(safe-area-inset-bottom, 0px));
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 28px;
		font-weight: 300;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 6px rgba(17, 17, 19, 0.18), 0 8px 24px rgba(17, 17, 19, 0.16);
		z-index: 20;
	}
	.fab:active {
		transform: scale(0.96);
	}
	/* Three columns: the side zones share the free space equally, so the
	   search bar sits in the true centre and the two panel toggles stay
	   pinned to the window's left and right edges whatever the panels do. */
	.topbar {
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.zone {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.zone.end {
		justify-content: flex-end;
	}
	/* Takes all the free space between the search bar and the "?" button
	   and centres the sync indicator inside it. */
	.sync-slot {
		flex: 1;
		display: flex;
		justify-content: center;
		min-width: 0;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.help-btn {
		position: relative;
		font-weight: 600;
	}
	/* Red or orange: something to look at in Status; blue: updates not seen yet. */
	.badge {
		position: absolute;
		top: 5px;
		right: 5px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--danger);
		box-shadow: 0 0 0 2px var(--bg);
	}
	.badge.warn {
		background: #f59e0b;
	}
	.badge.news {
		background: var(--accent);
	}
	.search-slot {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		pointer-events: none;
	}
	.search-inner {
		width: 100%;
		max-width: 420px;
		pointer-events: auto;
		container-type: inline-size;
	}
	.nav-icon-btn {
		width: var(--control-h);
		padding: 0;
		font-size: 16px;
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.nav-icon-btn:hover:not(:disabled) {
		color: var(--text);
	}
	.nav-icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.nav-icon-btn.active {
		background: var(--bg-hover);
		color: var(--text);
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.side {
		width: var(--panel-width);
		overflow-x: hidden;
		flex-shrink: 0;
		background: var(--bg-side);
		border-right: 1px solid var(--border);
		min-height: 0;
		/* Panels can be taller than the viewport (spec: "peuvent être plus
		   hauts que la fenêtre"); each scrolls independently via .scroll-y. */
	}
	.resizer {
		width: 7px;
		margin: 0 -3px;
		flex-shrink: 0;
		cursor: col-resize;
		z-index: 5;
		position: relative;
	}
	.resizer::after {
		content: '';
		position: absolute;
		inset: 0 2px;
		background: transparent;
		transition: background 0.12s;
	}
	.resizer:hover::after {
		background: var(--border-strong);
	}
	.content {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}
	.scrim {
		display: none;
	}

	/* Phones and narrow windows: panels become drawers over the page. */
	@media (max-width: 760px) {
		.topbar {
			grid-template-columns: auto minmax(0, 1fr) auto;
			gap: 8px;
			padding: 8px;
			padding-top: calc(8px + env(safe-area-inset-top, 0px));
		}
		.nav-icon-btn {
			width: 36px;
			height: 36px;
		}
		.hide-narrow {
			display: none;
		}
		/* The sync dot keeps to its own small place, never over the search box (15 Nov 2026). */
		.sync-slot {
			flex: none;
			width: 20px;
		}
		.side {
			position: fixed;
			top: 49px;
			bottom: 0;
			z-index: 40;
			width: min(300px, 86vw);
			box-shadow: var(--shadow-pop);
		}
		.side.left {
			left: 0;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 49px 0 0 0;
			z-index: 30;
			background: rgba(17, 17, 19, 0.3);
		}
	}
</style>
