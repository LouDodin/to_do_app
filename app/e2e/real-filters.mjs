// Every saved filter: the app's offline evaluation must match Vikunja's own result.
// Usage: node e2e/real-filters.mjs <appBase> <apiBase> <jwt> <server-filters.json>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [base, api, jwt, file] = process.argv.slice(2);
const expected = JSON.parse(readFileSync(file, 'utf8'));
const get = async (p) => (await fetch(api + p, { headers: { Authorization: `Bearer ${jwt}` } })).json();
const projects = await get('/api/v1/projects?is_archived=true&per_page=50');
const bin = projects.find((p) => /^bin$/i.test(p.title));
const byId = new Map(); for (let pg = 1; pg < 10; pg++) { const b = await get(`/api/v1/tasks?page=${pg}&per_page=50`); if (!b.length) break; for (const t of b) byId.set(t.id, t); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 4000 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForTimeout(6000);
let bad = 0;
for (const [fid, f] of Object.entries(expected)) {
  await page.goto(`${base}/filter/${fid}`); await page.waitForTimeout(1200);
  const toggle = page.getByText(/Show completed/);
  if (await toggle.count()) { await toggle.first().click(); await page.waitForTimeout(400); }
  const titles = (await page.locator('.row .title').allTextContents()).map((s) => s.trim());
  // Vikunja also returns tasks sitting in the Bin project: the app keeps those out of every view.
  const want = f.server.map((id) => byId.get(id)).filter((t) => t && t.project_id !== bin?.id).map((t) => t.title.trim());
  const missing = want.filter((t) => !titles.includes(t));
  const extra = titles.filter((t) => !want.includes(t));
  const ok = missing.length === 0 && extra.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  filter "${f.title}": app ${titles.length} / Vikunja ${want.length}${ok ? '' : `  missing ${JSON.stringify(missing.slice(0, 4))} extra ${JSON.stringify(extra.slice(0, 4))}  [${f.filter}]`}`);
}
await browser.close();
process.exit(bad ? 1 : 0);
