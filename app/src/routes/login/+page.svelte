<script lang="ts">
	import '../../lib/app.css';
	import { goto } from '$app/navigation';
	import { login, TotpRequiredError } from '../../lib/api/auth';
	import { initSync } from '../../lib/db/sync';
	import { initHealth } from '../../lib/stores/health.svelte';
	import { getApiUrl, defaultApiUrl } from '../../lib/api/config';
	import { db } from '../../lib/db/schema';
	import { liveState } from '../../lib/db/live.svelte';

	// Changes made while signed out stay on this device and are sent after sign-in: say so.
	const waiting = liveState(() => db.queue.count(), 0);

	let apiUrl = $state(getApiUrl() ?? defaultApiUrl());
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let totp = $state('');
	// The server's address is known (this site's own): it is not shown, so that a password manager
	// (Bitwarden on the phone) does not take it for the username box (13 Nov 2026). "Change server"
	// shows it.
	let showServer = $state(!apiUrl);
	let needTotp = $state(false);

	async function submit() {
		error = '';
		loading = true;
		try {
			await login(apiUrl.trim(), username.trim(), password, needTotp ? totp : undefined);
			// Start syncing now: the layout only starts it at launch, so a first sign-in
			// used to leave the app empty (or blank) until the next reload.
			initSync();
			initHealth();
			goto('/');
		} catch (e) {
			if (e instanceof TotpRequiredError) needTotp = true;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in — Tasks</title>
</svelte:head>

<div class="login">
	<form class="card" data-allow-autofill onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<h1>Sign in</h1>
		{#if waiting.value > 0}
			<p class="waiting">{waiting.value} change{waiting.value === 1 ? '' : 's'} made on this device {waiting.value === 1 ? 'is' : 'are'} kept here and will be sent as soon as you sign in.</p>
		{/if}
		{#if showServer}
			<label>
				<span>Server</span>
				<input type="url" name="server" placeholder="https://my-instance.example.com" bind:value={apiUrl} required autocomplete="off" data-bwignore="true" data-1p-ignore="true" data-lpignore="true" />
			</label>
		{/if}
		<label>
			<span>Username</span>
			<input type="text" id="username" name="username" bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" required />
		</label>
		<label>
			<span>Password</span>
			<input type="password" id="password" name="password" bind:value={password} autocomplete="current-password" required />
		</label>
		{#if needTotp}
			<label>
				<span>Two-factor code</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" bind:value={totp} autofocus required />
			</label>
		{/if}
		{#if error}<p class="error">{error}</p>{/if}
		{#if !showServer}<button type="button" class="change-server" onclick={() => (showServer = true)}>Change server</button>{/if}
		<button class="btn btn-primary" type="submit" disabled={loading}>
			{loading ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
</div>

<style>
	.login {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
	}
	.card {
		width: 360px;
		max-width: calc(100vw - 32px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 8px;
	}
	h1 {
		font-size: var(--fs-xl);
		letter-spacing: -0.01em;
		margin: 0 0 8px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--text-dim);
	}
	.waiting {
		font-size: var(--fs-sm);
		margin: 0;
		padding: 8px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.error {
		color: var(--danger);
		font-size: var(--fs-sm);
		margin: 0;
	}
	.change-server {
		align-self: flex-start;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		text-decoration: underline;
		padding: 0;
	}
</style>
