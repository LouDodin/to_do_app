// 19 Nov 2026 (Lou's to-do #558, #566, #572): Abandon for a selection; + next to each Home block
// (a new task with that block's label); while a row's title is edited, its labels stay in view and
// + adds one at once. TEST Vikunja only. Usage: node e2e/nov19b.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { for (let k = 0; k < 6; k++) { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).catch(() => null); if (r && (r.ok || r.status < 500)) return r.json().catch(() => null); await new Promise((x) => setTimeout(x, 400 * (k + 1))); } return null; };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Nov19b ${st}` });
const labels = await req('GET', '/api/v1/labels?per_page=50');
const valid = labels.find((l) => l.title === 'ctx:validated') ?? (await req('PUT', '/api/v1/labels', { title: 'ctx:validated' }));
const mk = async (title) => { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title }); await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: valid.id }); return t; };
const a = await mk(`give up one ${st}`), b2 = await mk(`give up two ${st}`), c = await mk(`edit me ${st}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([x, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', x); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); localStorage.setItem('view', 'all'); localStorage.setItem('new_task_last_project', String(P.id)); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
// #566
for (const [block, label] of [['Today', 'today'], ['This week', 'week'], ['Red', 'p1'], ['Available', 'next-action']]) {
	await p.getByRole('button', { name: `New task in ${block}`, exact: true }).click(); await p.waitForTimeout(800);
	const chips = (await p.locator('.card .bar').innerText()).toLowerCase();
	check(`Home: + next to ${block} opens a new task with the label ${label}`, chips.includes(label), chips);
	if (block === 'Today') {
		await p.locator('.card textarea, .card input').first().fill(`from today block ${st}`);
		await p.getByLabel('Project', { exact: true }).selectOption(String(P.id));
		await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
	} else { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
}
const made = (await req('GET', `/api/v1/tasks?s=${encodeURIComponent(`from today block ${st}`)}`)) ?? [];
check('…the task is created with "today", and shows under Today', (made[0]?.labels ?? []).some((l) => l.title === 'today') && (await p.locator('section', { has: p.locator('h2', { hasText: 'Today' }) }).getByText(`from today block ${st}`).count()) === 1, JSON.stringify(made[0]?.labels?.map((l) => l.title)));
// #558
await p.goto(base + `/project/${P.id}`); await p.waitForTimeout(2500);
await p.locator('.row', { hasText: `give up one ${st}` }).locator('.title').click({ modifiers: ['Control'] });
await p.locator('.row', { hasText: `give up two ${st}` }).locator('.title').click({ modifiers: ['Control'] });
await p.waitForTimeout(400);
await p.getByRole('button', { name: 'Abandon', exact: true }).click(); await p.waitForTimeout(4000);
const sa = await req('GET', `/api/v1/tasks/${a.id}`), sb = await req('GET', `/api/v1/tasks/${b2.id}`);
const ab = (t) => t.done && (t.labels ?? []).some((l) => l.title === 'ctx:abandoned');
check('selection: Abandon closes both, marked abandoned', ab(sa) && ab(sb), JSON.stringify([sa.done, sa.labels?.map((l) => l.title)]));
check('…and the selection ends', (await p.locator('.bulk, .bulkbar, [class*="bulk"]').filter({ hasText: 'Abandon' }).count()) === 0);
// #572
await p.locator('.row', { hasText: `edit me ${st}` }).locator('.title').click(); await p.waitForTimeout(400);
const row = p.locator('.row', { has: p.locator('textarea.edit-input') });
check('editing a title: the labels + stays in view', await row.getByRole('button', { name: 'Add label' }).isVisible());
const tb = await row.locator('textarea.edit-input').boundingBox(), lb = await row.getByRole('button', { name: 'Add label' }).boundingBox();
check('…the edit box stops before it', tb.x + tb.width <= lb.x + 1, JSON.stringify({ tb, lb }));
await row.locator('textarea.edit-input').fill(`edit me now ${st}`);
await row.getByRole('button', { name: 'Add label' }).click(); await p.waitForTimeout(500);
check('…one click on + opens the labels (no click elsewhere first)', (await p.locator('.labels-anchor').count()) === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(2500);
check('…and the new title is kept', (await req('GET', `/api/v1/tasks/${c.id}`)).title === `Edit me now ${st}` || (await req('GET', `/api/v1/tasks/${c.id}`)).title === `edit me now ${st}`, (await req('GET', `/api/v1/tasks/${c.id}`)).title);
await browser.close();
for (const t of [...made, a, b2, c]) await req('DELETE', `/api/v1/tasks/${t.id}`);
await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
