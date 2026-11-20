import { defineConfig } from 'vitest/config';

// Unit tests run on plain TypeScript modules (filters, contexts, dedupe,
// home blocks) with a fake IndexedDB, so no browser is needed.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test/setup.ts']
	},
	resolve: {
		alias: { $lib: new URL('./src/lib', import.meta.url).pathname }
	}
});
