// The week's list on the home page (This week, under Today) and on the Tomorrow page
// (13 Nov 2026). TEST Vikunja only. Usage: node e2e/week-sections.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Week ${st}` });
let week = (await req('GET', '/api/v1/labels?per_page=200')).find((l) => l.title === 'week') ?? (await req('PUT', '/api/v1/labels', { title: 'week', hex_color: '1e88e5' }));
let valid = (await req('GET', '/api/v1/labels?per_page=200')).find((l) => l.title === 'ctx:validated') ?? (await req('PUT', '/api/v1/labels', { title: 'ctx:validated' }));
const mk = async (title, labels) => { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title }); for (const l of labels) await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: l.id }); return t; };
const wTitle = `On the week ${st}`, oTitle = `Not on the week ${st}`;
const W = await mk(wTitle, [week, valid]);
// A "week" label the account cannot use (seen on the test server): make one it can.
if (!((await req('GET', `/api/v1/tasks/${W.id}`))?.labels ?? []).some((l) => l.title === 'week')) {
	week = await req('PUT', '/api/v1/labels', { title: 'week', hex_color: '1e88e5' });
	await req('PUT', `/api/v1/tasks/${W.id}/labels`, { label_id: week.id });
}
await mk(oTitle, [valid]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); localStorage.setItem('view', 'all'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
const heads = (await p.locator('.home h2.section-title').allInnerTexts()).map((s) => s.trim());
check('home: Today, This week, Red, Available', heads.join('|') === 'Today|This week|Red|Available', heads.join('|'));
const sec = p.locator('section', { has: p.locator('h2', { hasText: 'This week' }) });
check('home: the week’s task is under This week', (await sec.getByText(wTitle).count()) === 1);
check('home: another task is not', (await sec.getByText(oTitle).count()) === 0);
await p.goto(base + '/today-review'); await p.waitForTimeout(3000);
// 13 Nov 2026 (later): the week's list is a group of "To consider" (see e2e/reviews.mjs).
const wk = p.locator('[data-step="consider"]');
check('tomorrow: the week’s task is in To consider, group This week', (await wk.getByText(wTitle).count()) === 1 && (await wk.locator('.group', { hasText: 'This week' }).count()) === 1, await wk.innerText().catch(() => ''));
check('tomorrow: and only once on the page', (await p.getByText(wTitle).count()) === 1, await p.getByText(wTitle).count());
await wk.locator('.slot', { hasText: wTitle }).getByRole('button', { name: "Add it to tomorrow's list", exact: true }).click(); await p.waitForTimeout(2000);
const t = (await req('GET', `/api/v1/projects/${P.id}/tasks`)).find?.((x) => x.title === wTitle) ?? (await req('GET', `/api/v1/tasks?s=${encodeURIComponent(wTitle)}`))[0];
check('tomorrow: ☆ puts it on tomorrow’s list (label today)', (t.labels || []).some((l) => l.title === 'today'), JSON.stringify((t.labels || []).map((l) => l.title)));
await browser.close();
await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
