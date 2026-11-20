// Archiving a project on the server must not wipe its tasks from the devices
// (Vikunja does not list tasks of archived projects). LOCAL test copy only.
// Usage: node e2e/real-archive.mjs <appBase> <apiBase> <jwt> <projectId>
import { chromium } from 'playwright-core';
const [base, api, jwt, pid] = process.argv.slice(2);
const req = (m, p, b) => fetch(api + p, { method: m, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForTimeout(6000);
const local = () => page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result.filter((t) => t.project_id === id).length); }; }), Number(pid));
const before = await local();
const p = await req('GET', `/api/v1/projects/${pid}`);
await req('POST', `/api/v1/projects/${pid}`, { ...p, is_archived: true });
await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(4000);
const after = await local();
await req('POST', `/api/v1/projects/${pid}`, { ...p, is_archived: false });
const ok = before > 0 && after === before;
console.log(`${ok ? 'PASS' : 'FAIL'}  archive: the project's ${before} tasks stay on the device (after sync: ${after})`);
await browser.close();
process.exit(ok ? 0 : 1);
