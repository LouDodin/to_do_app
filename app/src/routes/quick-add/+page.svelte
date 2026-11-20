<script lang="ts">
	// Bare capture window opened by an OS-level shortcut. No sidebars, no
	// shell: the same new-task card as inside the app, then the window
	// closes itself.
	import '../../lib/app.css';
	import { onMount } from 'svelte';
	import { isConfigured, getApiUrl, defaultApiUrl } from '../../lib/api/config';
	import { login } from '../../lib/api/auth';
	import { initSync, flushQueue } from '../../lib/db/sync';
	import QuickAdd from '../../lib/components/QuickAdd.svelte';

	let ready = $state(false);
	// Android "Share to Tasks" (manifest share_target) opens /quick-add?title=…&text=…&url=…
	const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	const sharedText = (params.get('text') ?? '').trim();
	const sharedUrl = (params.get('url') ?? '').trim();
	const sharedTitle = (params.get('title') ?? '').trim();
	const firstLine = sharedText.split('\n')[0].replace(/https?:\/\/\S+/g, '').trim();
	const initialTitle = (sharedTitle || firstLine || (sharedUrl || sharedText ? 'Shared link' : '')).slice(0, 250);
	const initialDescription = [sharedText !== firstLine ? sharedText : '', sharedUrl].filter(Boolean).join('\n');
	const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
	// "?panel": shown in the floating native panel (no window around it, transparent background).
	const panelMode = typeof location !== 'undefined' && location.search.includes('panel');
	let box: HTMLDivElement | undefined = $state();
	let apiUrl = $state(getApiUrl() ?? defaultApiUrl());
	let username = $state('');
	let password = $state('');
	let loginError = $state('');

	type Bridge = { postMessage: (m: unknown) => void };
	const bridge = (): Bridge | undefined =>
		(window as unknown as { webkit?: { messageHandlers?: { panel?: Bridge } } }).webkit?.messageHandlers?.panel;
	function closeSelf() {
		const b = bridge();
		if (b) b.postMessage({ action: 'close' });
		else window.close();
	}
	async function signIn() {
		loginError = '';
		try {
			await login(apiUrl.trim(), username.trim(), password);
			password = '';
			initSync();
			ready = true;
		} catch (e) {
			loginError = e instanceof Error ? e.message : String(e);
		}
	}
	// The panel follows the height of its content.
	$effect(() => {
		const b = bridge();
		if (!b || !box) return;
		const send = () => b.postMessage({ action: 'resize', height: Math.ceil(box!.getBoundingClientRect().height) + 6 });
		const ro = new ResizeObserver(send);
		ro.observe(box);
		send();
		return () => ro.disconnect();
	});

	onMount(() => {
		// A small window: browsers that allow it shrink this one to fit the panel.
		if (!panelMode) {
			try {
				window.resizeTo(600, 170);
			} catch {
				// not allowed
			}
		}
		if (isConfigured()) {
			initSync();
			ready = true;
		}
	});

	let closed = $state(false);
	async function done() {
		await flushQueue();
		closeSelf();
		// A window the browser refuses to close (opened as a normal tab) says so.
		setTimeout(() => (closed = true), 300);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') closeSelf();
	}
</script>

<svelte:head><title>New task</title></svelte:head>
<svelte:window onkeydown={onKey} />

{#if closed}
	<div class="capture"><p class="not-configured">Task added to the Inbox.</p><a class="btn" href="/">Open Tasks</a></div>
{:else}
<div class="capture" class:panel={panelMode} bind:this={box}>
	{#if !ready}
		<form class="signin" onsubmit={(e) => { e.preventDefault(); signIn(); }}>
			<p class="not-configured">Sign in once here (this panel keeps its own session).</p>
			<input type="url" bind:value={apiUrl} placeholder="Vikunja address" required />
			<input type="text" bind:value={username} placeholder="Username" autocomplete="username" required />
			<input type="password" bind:value={password} placeholder="Password" autocomplete="current-password" required />
			{#if loginError}<p class="not-configured" role="alert">{loginError}</p>{/if}
			<button class="btn btn-primary" type="submit">Sign in</button>
		</form>
	{:else}
		<QuickAdd compact onDone={done} {initialTitle} {initialDescription} />
		{#if !panelMode && !touch}<p class="tip">Enter adds it to the Inbox · Esc closes</p>{/if}
	{/if}
</div>
{/if}

<style>
	:global(body) {
		margin: 0;
	}
	.capture {
		padding: 14px;
		background: var(--bg);
		min-height: 100vh;
	}
	.capture.panel {
		background: transparent;
		min-height: 0;
		padding: 4px;
	}
	:global(html:has(.capture.panel)),
	:global(body:has(.capture.panel)) {
		background: transparent !important;
	}
	.capture.panel :global(.quick-add) {
		background: var(--bg);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
	}
	.signin {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 14px;
	}
	.tip {
		margin: 0;
		padding: 8px 4px 0;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.not-configured {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
</style>
