<script lang="ts">
	// Shown when a page cannot open. Usually a newer version was installed while the app was
	// open: reloading fixes it. Changes not sent yet are kept on this device either way.
	import { page } from '$app/state';
</script>

<svelte:head><title>Tasks: page could not open</title></svelte:head>

<div class="err">
	<p class="code">{page.status}</p>
	<h1>{page.status === 404 ? 'This page does not exist' : 'This page could not open'}</h1>
	<p>Your unsent changes are safe on this device.</p>
	<div class="row">
		<button class="btn" onclick={() => location.reload()}>Reload</button>
		<a class="btn btn-outline" href="/">Home</a>
	</div>
	{#if page.error?.message && page.error.message !== 'Internal Error' && page.status !== 404}<p class="dim">{page.error.message}</p>{/if}
</div>

<style>
	.err {
		max-width: 460px;
		margin: 12vh auto 0;
		padding: 0 16px;
		text-align: center;
	}
	.code {
		font-size: 40px;
		font-weight: 300;
		color: var(--text-faint);
		margin: 0;
	}
	h1 {
		font-size: 20px;
		margin: 4px 0 10px;
	}
	p {
		color: var(--text-dim);
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: center;
		margin-top: 16px;
	}
	.dim {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		margin-top: 16px;
	}
</style>
