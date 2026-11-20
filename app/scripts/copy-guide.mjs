// Before each build: the user guide (guide/guide.html and its pictures) goes into the app, at
// /guide/guide.html, so Help centre > Help can open it on every device (10 Nov 2026). Kept out of
// the offline cache (see vite.config.ts): it is only fetched when opened.
import { mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
const out = 'static/guide';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync('guide')) if (f === 'guide.html' || f.endsWith('.png')) copyFileSync(`guide/${f}`, `${out}/${f}`);
console.log('user guide copied into static/guide');
