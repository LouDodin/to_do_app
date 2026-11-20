<script lang="ts">
	// Plain one-colour line icons (they take the surrounding text colour),
	// instead of the OS's coloured emoji, so they look the same everywhere.
	let { name, size = 16 }: { name: 'home' | 'trash' | 'calendar' | 'moon' | 'search' | 'plus' | 'undo' | 'redo' | 'check' | 'folder' | 'tag' | 'more' | 'close' | 'inbox' | 'pause' | 'cart' | 'upcoming' | 'link' | 'abandon'; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'home'}
		<path d="M3 11.5 12 4l9 7.5" />
		<path d="M5.5 10v10h13V10" />
		<path d="M10 20v-6h4v6" />
	{:else if name === 'trash'}
		<path d="M4 7h16" />
		<path d="M9 7V4h6v3" />
		<path d="M6 7l1 13h10l1-13" />
		<path d="M10 11v6M14 11v6" />
	{:else if name === 'calendar'}
		<rect x="3.5" y="5" width="17" height="15.5" rx="2" />
		<path d="M3.5 10h17M8 3v4M16 3v4" />
	{:else if name === 'abandon'}
		<circle cx="12" cy="12" r="8.5" />
		<path d="M6 18 18 6" />
	{:else if name === 'link'}
		<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
		<path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
	{:else if name === 'upcoming'}
		<rect x="3.5" y="4" width="17" height="16.5" rx="2" />
		<path d="M3.5 8.5h17M7.5 12.5h2M12 12.5h4.5M7.5 16.5h2M12 16.5h4.5" />
	{:else if name === 'moon'}
		<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6.5" />
		<path d="m16 16 4.5 4.5" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'undo'}
		<path d="M9 14 4 9l5-5" />
		<path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
	{:else if name === 'redo'}
		<path d="m15 14 5-5-5-5" />
		<path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
	{:else if name === 'check'}
		<path d="m5 12.5 4.5 4.5L19 7.5" />
	{:else if name === 'folder'}
		<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
	{:else if name === 'tag'}
		<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0Z" />
		<circle cx="8.2" cy="8.2" r="1.4" />
	{:else if name === 'more'}
		<circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
		<circle cx="12" cy="12" r="1.2" fill="currentColor" />
		<circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'inbox'}
		<path d="M3.5 13.5 6 5.5h12l2.5 8V19h-17Z" />
		<path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5" />
	{:else if name === 'pause'}
		<circle cx="12" cy="12" r="8.5" />
		<path d="M10 9v6M14 9v6" />
	{:else if name === 'cart'}
		<path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.1l1.4-6.3H6.6" />
		<circle cx="9.5" cy="19.3" r="1.2" />
		<circle cx="17" cy="19.3" r="1.2" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		flex-shrink: 0;
	}
</style>
