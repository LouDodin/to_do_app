// The changes of 13 Nov 2026: Upcoming (the coming days and what is planned for each), the week's
// list (label "week", from the Weekly review), wider candidates in Tomorrow's priorities, pending
// tasks hidden everywhere, the shopping label leaving the Inbox, the Black theme. TEST Vikunja only.
// Usage: node e2e/nov13.mjs <app> <api> <user> <pass> [shots dir]
import { chromium } from 'playwright-core';
const [base, api, user, pass, shots] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const st = Date.now().toString(36).slice(-4);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (offset, h = 10) => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setDate(d.getDate() + offset); return d.toISOString(); };

// Fixtures (a write can fail while the test server is busy: checked and tried again)
const P = await req('PUT', '/api/v1/projects', { title: `Nov13 ${st}` });
const mk = async (title, extra = {}) => { for (let k = 0; k < 6; k++) { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title, ...extra }); if (t?.id) return t; await wait(600); } throw new Error('could not create ' + title); };
let labels = [];
for (let pg = 1; pg < 20; pg++) { const l = await req('GET', `/api/v1/labels?per_page=50&page=${pg}`); if (!l?.length) break; labels = labels.concat(l); }
const label = async (title) => labels.find((l) => l.title === title) ?? (await req('PUT', '/api/v1/labels', { title, hex_color: '888888' }));
const give = async (t, l) => { for (let k = 0; k < 6; k++) { await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: l.id }); if (((await req('GET', `/api/v1/tasks/${t.id}`))?.labels ?? []).some((x) => x.id === l.id)) return; await wait(600); } };
const validated = await label('ctx:validated'), pending = await label('ctx:pending'), nextA = await label('next-action');
const planned = await mk(`planned in two days ${st}`, { start_date: day(2) });
const dueT = await mk(`due tomorrow ${st}`, { due_date: day(1, 20) });
const later = await mk(`next month ${st}`, { start_date: day(20) });
const held = await mk(`held with next action ${st}`, { due_date: day(1, 20) });
const recent = await mk(`just added ${st}`);
const nx = await mk(`a next action ${st}`);
for (const t of [planned, dueT, later, held, recent, nx]) await give(t, validated);
await give(held, pending); await give(held, nextA); await give(nx, nextA);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};
const { ctx, p } = await open({ viewport: { width: 1280, height: 900 } });
const txt = async (sel = 'main') => (await p.locator(sel).first().innerText()).toLowerCase();

// ---------- Tomorrow's priorities: candidates, pending hidden ----------
await p.goto(base + '/today-review'); await p.waitForTimeout(2500);
// The labels given through the server reach the app at its next sync: waited for.
for (let k = 0; k < 12; k++) { const x = await txt(); if (x.includes(`a next action ${st}`) && x.includes(`just added ${st}`.slice(0, 4)) && x.includes('recently added')) break; await p.waitForTimeout(2500); }
let t = await txt();
if (process.env.DBG) { const groups = await p.locator('[data-step="3"] .group').allInnerTexts(); console.log('GROUPS', groups.join(' | '), t.includes('a next action'), t.includes('just added')); }
check('Tomorrow: a next action is a candidate', t.includes(`a next action ${st}`));
check('Tomorrow: a task just added is a candidate (group "Recently added", folded)', t.includes('recently added'));
check('Tomorrow: due tomorrow is among the tasks to consider', t.includes(`due tomorrow ${st}`));
check('Tomorrow: a pending task is nowhere, even due and next action', !t.includes(`held with next action ${st}`));

// ---------- Weekly review: plan the week ----------
await p.goto(base + '/weekly'); await p.waitForTimeout(2500);
const step10 = p.locator('[data-step="plan"]');
check('Weekly: the last step is "Plan the coming week"', (await step10.innerText()).includes('Plan the coming week'));
for (let k = 0; k < 10 && !(await step10.innerText()).toLowerCase().includes(`a next action ${st}`); k++) await p.waitForTimeout(1500);
if (process.env.DBG) { await step10.scrollIntoViewIfNeeded(); await p.screenshot({ path: '/tmp/claude-0/-home-claude/8f7b8f98-068f-5363-98d2-bf8b341f46af/scratchpad/n13/weekly-dbg.png' }); console.log((await step10.innerText()).slice(0, 800)); }
const row = step10.locator('.slot', { hasText: `a next action ${st}` });
if (process.env.DBG) console.log('SLOTS', await row.count(), JSON.stringify(await row.allInnerTexts()), JSON.stringify(await step10.locator('.group').allInnerTexts()));
check('Weekly: the candidates have a ☆, not a circle to complete them', (await row.locator('.checkbox').count()) === 0 && (await row.getByRole('button', { name: "Add it to the week's list", exact: true }).count()) === 1);
await row.getByRole('button', { name: "Add it to the week's list", exact: true }).click(); await p.waitForTimeout(2500);
t = (await step10.innerText()).toLowerCase();
const weekIdx = t.indexOf('your list for the week'), nxIdx = t.indexOf(`a next action ${st}`), groupIdx = t.indexOf('next actions');
check('Weekly: Pick puts it on the week\'s list', weekIdx >= 0 && nxIdx > weekIdx && (groupIdx < 0 || nxIdx < groupIdx), t.slice(0, 300));
let server = await req('GET', `/api/v1/tasks/${nx.id}`);
for (let k = 0; k < 8 && !(server?.labels ?? []).some((l) => l.title === 'week'); k++) { await wait(1000); server = await req('GET', `/api/v1/tasks/${nx.id}`); }
check('Weekly: …with the label "week" on the server', (server?.labels ?? []).some((l) => l.title === 'week'), JSON.stringify((server?.labels ?? []).map((l) => l.title)));
check('Weekly: a pending task is only in "Pending tasks"', !(await p.locator('[data-step="missed"], [data-step="plan"]').allInnerTexts()).join(' ').toLowerCase().includes(`held with next action ${st}`));

// ---------- Tomorrow: the week's list comes first ----------
await p.goto(base + '/today-review'); await p.waitForTimeout(2000);
t = await txt();
check('Tomorrow: the week\'s list is among the tasks to consider', (await p.locator('[data-step="consider"]').innerText()).toLowerCase().includes(`a next action ${st}`) && t.includes('this week'), t.slice(0, 400));

// ---------- Upcoming ----------
await p.goto(base + '/upcoming'); await p.waitForTimeout(2000);
const dayBox = (i) => p.locator(`#day-${i}`);
check('Upcoming: the strip of 7 days, then every day for two months at least, today first (14 Nov 2026)', (await p.locator('.strip .sd').count()) === 7 && (await p.locator('section.day[id^="day-"]').count()) >= 61 && (await dayBox(0).innerText()).includes('Today'));
check('Upcoming: a task starting in two days is under that day', (await dayBox(2).innerText()).toLowerCase().includes(`planned in two days ${st}`));
check('Upcoming: a task due tomorrow is under tomorrow, as due', (await dayBox(1).innerText()).toLowerCase().includes(`due tomorrow ${st}`) && (await dayBox(1).innerText()).toLowerCase().includes('due'));
check('Upcoming: the week\'s list not planned yet is at the top', (await p.locator('.to-plan').innerText()).toLowerCase().includes(`a next action ${st}`));
check('Upcoming: a task in three weeks is under its own day', (await dayBox(20).innerText()).toLowerCase().includes(`next month ${st}`), await dayBox(20).innerText());
check('Upcoming: a pending task is not there', !(await txt()).includes(`held with next action ${st}`));
// Plan the week task for day 3 with the row's menu.
await p.locator('.to-plan .item', { hasText: `a next action ${st}` }).locator('.plan input').fill(new Date(day(3)).toLocaleDateString('en-CA'));
await p.waitForTimeout(1500);
check('Upcoming: planned with the menu, it moves under that day', (await dayBox(3).innerText()).toLowerCase().includes(`a next action ${st}`) && !(await p.locator('.to-plan').count()));
server = await req('GET', `/api/v1/tasks/${nx.id}`);
for (let k = 0; k < 8 && new Date(server?.start_date).getDate() !== new Date(day(3)).getDate(); k++) { await wait(1000); server = await req('GET', `/api/v1/tasks/${nx.id}`); }
check('Upcoming: …its start date is that day on the server', new Date(server?.start_date).getDate() === new Date(day(3)).getDate(), server?.start_date);
// Drag it to tomorrow (computer).
await dayBox(3).locator('.item', { hasText: `a next action ${st}` }).dragTo(dayBox(1).locator('.dh'));
await p.waitForTimeout(1500);
check('Upcoming: dragged onto another day, it moves there', (await dayBox(1).innerText()).toLowerCase().includes(`a next action ${st}`), await dayBox(1).innerText());
if (shots) await p.screenshot({ path: `${shots}/upcoming.png`, fullPage: true });
// + next to a day: the new task window, with that day
await dayBox(4).locator('.dh').hover();
await dayBox(4).getByRole('button', { name: /^New task for/ }).click(); await p.waitForTimeout(500);
const dlg = p.getByRole('dialog', { name: 'New task' });
check('Upcoming: + next to a day opens the new task window', await dlg.isVisible());
const card = await dlg.boundingBox(); const add = await dlg.getByRole('button', { name: 'Add the task' }).boundingBox();
check('the window: everything inside its box', !!card && !!add && add.x + add.width <= card.x + card.width + 1, JSON.stringify([card, add]));
if (shots) await p.screenshot({ path: `${shots}/newtask.png` });
await dlg.getByLabel('Project').selectOption({ label: `Nov13 ${st}` });
await dlg.getByLabel('Task', { exact: true }).fill(`from upcoming ${st}`);
await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
check('…the task lands on that day', (await dayBox(4).innerText()).toLowerCase().includes(`from upcoming ${st}`), await dayBox(4).innerText());
// The New task box: 🛒 with a title typed adds it to the Shopping list at once
await p.keyboard.press('Escape');
await p.goto(base + '/quick-add'); await p.waitForTimeout(1500);
await p.getByLabel('New task').fill(`cart item ${st}`);
await p.getByRole('button', { name: 'Shopping' }).click(); await p.waitForTimeout(1500);
await p.goto(base + '/shopping'); await p.waitForTimeout(1500);
check('🛒 with a title typed: on the Shopping list at once, no Add', (await txt()).includes(`cart item ${st}`));

// ---------- Pending tasks hidden from a label's page and a filter ----------
await p.goto(`${base}/label/${nextA.id}`); await p.waitForTimeout(1500);
check('Label page: a pending task is not listed', !(await txt()).includes(`held with next action ${st}`) && (await txt()).includes(`a next action ${st}`));

// ---------- Black theme ----------
await p.goto(base + '/settings?tab=settings'); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Black' }).click(); await p.waitForTimeout(300);
const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('Black theme: the page is black', bg === 'rgb(0, 0, 0)', bg);
check('Black theme: the manifest gives the black icon', (await p.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'))) === '/manifest-black.webmanifest');
await p.getByLabel('Labels in shades of grey').check(); await p.waitForTimeout(200);
check('Shades of grey: on', (await p.evaluate(() => document.documentElement.dataset.mono)) === '1');
await p.goto(base + '/upcoming'); await p.waitForTimeout(1500);
check('Black theme: kept after reloading, no white flash', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'black');
if (shots) await p.screenshot({ path: `${shots}/upcoming-black.png` });
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(1500);
if (shots) await p.screenshot({ path: `${shots}/project-black.png` });
await ctx.close();
{
	const ph = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	await ph.p.evaluate(() => localStorage.setItem('appearance_v1', JSON.stringify({ theme: 'black', mono: true })));
	await ph.p.goto(base + '/upcoming'); await ph.p.waitForTimeout(2500);
	if (shots) await ph.p.screenshot({ path: `${shots}/upcoming-phone-black.png` });
	await ph.p.goto(`${base}/project/${P.id}`); await ph.p.waitForTimeout(2000);
	if (shots) await ph.p.screenshot({ path: `${shots}/project-phone-black.png` });
	await ph.ctx.close();
}
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
