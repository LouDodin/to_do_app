// Against a local Vikunja holding a copy of real data: does the app mirror everything?
import { chromium } from 'playwright-core';
const [base, api, jwt] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForTimeout(8000);
const counts = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const db = r.result; const out = {}; let n = 0; const names = ['tasks', 'projects', 'labels', 'filters', 'bin', 'queue']; for (const s of names) { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => { out[s] = q.result; if (++n === names.length) res(out); }; } }; }));
console.log(JSON.stringify(counts));
await browser.close();
