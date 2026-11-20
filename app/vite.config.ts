import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// SvelteKit writes index.html (the app shell) after Vite has finished, so the service
// worker's file scan never sees it: add it by hand, with a new revision on every build.
const BUILD_ID = new Date().toISOString();

export default defineConfig({
	// Reachable from the phone through Tailscale (https://<mac-name>.<tailnet>.ts.net).
	server: { allowedHosts: ['.ts.net'] },
	preview: { allowedHosts: ['.ts.net'] },
	define: { __APP_BUILD__: JSON.stringify(BUILD_ID.slice(0, 16).replace('T', ' ')) },
	plugins: [
		{
			// build/version.txt: which build is live (shown by deploy-app on the PC).
			name: 'write-version',
			apply: 'build',
			generateBundle() {
				this.emitFile({ type: 'asset', fileName: 'version.txt', source: BUILD_ID + '\n' });
			}
		},
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'auto',
			includeAssets: ['favicon.svg'],
			manifest: {
				id: '/',
				name: 'Tasks',
				short_name: 'Tasks',
				description: 'Personal task manager (Vikunja backend)',
				lang: 'en-GB',
				theme_color: '#ffffff',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				categories: ['productivity'],
				// Long-press the app icon (Android) / right-click it (Windows, macOS dock).
				shortcuts: [
					{ name: 'New task', short_name: 'New task', url: '/quick-add', icons: [{ src: 'icons/new-task-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/new-task-96.png', sizes: '96x96', type: 'image/png' }] },
					{ name: 'Weekly review', short_name: 'Weekly', url: '/weekly' },
					{ name: 'Upcoming', short_name: 'Upcoming', url: '/upcoming' },
					{ name: 'Tomorrow', short_name: 'Tomorrow', url: '/today-review' }
				],
				// Android: "Share" from any app → Tasks → a new task in the Inbox.
				share_target: {
					action: '/quick-add',
					method: 'GET',
					params: { title: 'title', text: 'text', url: 'url' }
				},
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// App shell caching only. Data itself is mirrored in IndexedDB by the sync engine,
				// not by the service worker — the SW's job is just "the app loads with no network".
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
				// The user guide is opened on demand, never stored for offline use (10 Nov 2026).
				globIgnores: ['guide/**'],
				navigateFallback: '/index.html',
				navigateFallbackDenylist: [/^\/guide\//],
				additionalManifestEntries: [{ url: '/index.html', revision: BUILD_ID }],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				runtimeCaching: [
					{
						// Never let the SW cache/serve Vikunja API responses — the sync engine (IndexedDB)
						// owns that data. Always go to network for API calls; offline handling happens
						// in the sync engine's write queue, not here.
						urlPattern: ({ url }) => url.pathname.startsWith('/api-proxy/'),
						handler: 'NetworkOnly'
					}
				]
			},
			devOptions: {
				enabled: false
			}
		})
	]
});
