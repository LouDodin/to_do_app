// 20 Nov 2026 (Lou's to-do #575, #578, #579, #581, #582). TEST Vikunja only.
// Usage: node e2e/nov20.mjs <app> <api> <user> <pass>
import { chromium, devices } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { for (let k = 0; k < 6; k++) { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).catch(() => null); if (r && (r.ok || r.status < 500)) return r.json().catch(() => null); await new Promise((x) => setTimeout(x, 400 * (k + 1))); } return null; };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const titles = (t) => (t?.labels ?? []).map((l) => l.title);
const projects = await req('GET', '/api/v1/projects');
const inbox = projects.find((p) => p.title.toLowerCase() === 'inbox' && !p.parent_project_id) ?? (await req('PUT', '/api/v1/projects', { title: 'Inbox' }));
const P = await req('PUT', '/api/v1/projects', { title: `Nov20 ${st}` });
const labels = await req('GET', '/api/v1/labels?per_page=100');
const lab = async (t, hex) => labels.find((l) => l.title === t) ?? (await req('PUT', '/api/v1/labels', { title: t, hex_color: hex }));
const valid = await lab('ctx:validated', '4caf50'), week = await lab('week', '1e88e5'), today = await lab('today', '000000');
const mk = async (title, ls = []) => { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title }); for (const l of [valid, ...ls]) await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: l.id }); return t; };
const wk = await mk(`week task ${st}`, [week]);
const og = await mk(`ongoing task ${st}`, [today]);
const made = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const init = ([x, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', x); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); localStorage.setItem('view', 'all'); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(init, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);

// #581: drag from This week onto Today
const src = p.locator('section[data-block="week"] .row', { hasText: `week task ${st}` });
check('Home: the week task is in This week', (await src.count()) === 1);
await src.dragTo(p.locator('section[data-block="today"] .block-head')); await p.waitForTimeout(3500);
let s = await req('GET', `/api/v1/tasks/${wk.id}`);
check('#581 dragged onto Today: labelled today, no longer week', titles(s).includes('today') && !titles(s).includes('week'), titles(s));
check('…and shown under Today', (await p.locator('section[data-block="today"] .row', { hasText: `week task ${st}` }).count()) === 1);
await p.locator('section[data-block="today"] .row', { hasText: `week task ${st}` }).dragTo(p.locator('section[data-block="week"] .block-head')); await p.waitForTimeout(3500);
s = await req('GET', `/api/v1/tasks/${wk.id}`);
check('#581 and back onto This week: week, no longer today (#575: never both)', titles(s).includes('week') && !titles(s).includes('today'), titles(s));

// #582: ongoing
await p.goto(base + `/task/${og.id}`); await p.waitForTimeout(2000);
await p.locator('.ongoing-toggle input').check(); await p.waitForTimeout(3000);
s = await req('GET', `/api/v1/tasks/${og.id}`);
check('#582 task page: Ongoing marks it', titles(s).includes('ctx:ongoing'), titles(s));
await p.goto(base + '/'); await p.waitForTimeout(3000);
const ogSec = p.locator('section', { has: p.locator('h2', { hasText: /^Ongoing$/ }) });
check('…Home: an Ongoing block first, with it', (await ogSec.getByText(`ongoing task ${st}`).count()) === 1 && (await p.locator('section h2').first().innerText()) === 'Ongoing', await p.locator('section h2').first().innerText());
check('…and not also under Today', (await p.locator('section[data-block="today"]').getByText(`ongoing task ${st}`).count()) === 0);
await p.goto(base + '/today-review'); await p.waitForTimeout(3000);
check('…Tomorrow: in the group Ongoing (it is on today\'s list: there, otherwise first to consider)', (await p.locator('[data-group="Ongoing"]').getByText(`ongoing task ${st}`).count()) === 1 || (await p.locator('[data-step="chosen"]').getByText(`ongoing task ${st}`).count()) === 1, await p.locator('.group').allInnerTexts());
await p.goto(base + '/weekly'); await p.waitForTimeout(3000);
check('…Weekly: a group Ongoing, first of the groups', (await p.locator('[data-group="Ongoing"]').getByText(`ongoing task ${st}`).count()) === 1 && (await p.locator('[data-group]').first().getAttribute('data-group')) === 'Ongoing', await p.locator('[data-group]').first().getAttribute('data-group'));

// #578: the + window
await p.goto(base + '/'); await p.waitForTimeout(2000);
await p.locator('.fab, button[aria-label="New task"]').first().click(); await p.waitForTimeout(600);
const dlg = p.getByRole('dialog', { name: 'New task' });
check('#578 + opens the full window, project = Inbox', (await dlg.getByLabel('Project', { exact: true }).inputValue()) === String(inbox.id), await dlg.getByLabel('Project', { exact: true }).inputValue());
check('…with Remind, Repeat and 🛒', (await dlg.getByRole('button', { name: 'Reminder' }).count()) === 1 && (await dlg.getByLabel('Repeat').count()) === 1 && (await dlg.getByRole('button', { name: 'Shopping' }).count()) === 1);
await dlg.getByLabel('Task', { exact: true }).fill(`plain capture ${st}`); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
let found = (await req('GET', `/api/v1/tasks?s=${encodeURIComponent(`plain capture ${st}`)}`)) ?? [];
made.push(...found);
check('…title + Enter: in the Inbox, not validated', found[0]?.project_id === inbox.id && !titles(found[0]).includes('ctx:validated'), JSON.stringify([found[0]?.project_id, titles(found[0])]));
await p.locator('.fab, button[aria-label="New task"]').first().click(); await p.waitForTimeout(600);
await dlg.getByLabel('Task', { exact: true }).fill(`full capture ${st}`);
await dlg.getByLabel('Project', { exact: true }).selectOption(String(P.id));
await dlg.getByRole('button', { name: 'Reminder' }).click();
const rem = new Date(Date.now() + 3 * 86400e3); rem.setHours(8, 30, 0, 0);
const pad = (x) => String(x).padStart(2, '0');
await dlg.getByLabel('Remind me at').fill(`${rem.getFullYear()}-${pad(rem.getMonth() + 1)}-${pad(rem.getDate())}T08:30`);
await dlg.getByLabel('Task', { exact: true }).click();
await dlg.getByLabel('Repeat').selectOption('week');
await dlg.getByRole('button', { name: 'Add the task' }).click(); await p.waitForTimeout(4000);
found = (await req('GET', `/api/v1/tasks?s=${encodeURIComponent(`full capture ${st}`)}`)) ?? [];
made.push(...found);
const f = found[0] ? await req('GET', `/api/v1/tasks/${found[0].id}`) : null;
check('…with a project: in it and validated (skips the Inbox)', f?.project_id === P.id && titles(f).includes('ctx:validated'), JSON.stringify([f?.project_id, titles(f)]));
check('…its reminder kept', (f?.reminders ?? []).some((r) => Math.abs(new Date(r.reminder) - rem) < 60e3), JSON.stringify(f?.reminders));
check('…repeats every week, with a due date', f?.repeat_after === 604800 && f?.due_date && !f.due_date.startsWith('0001'), JSON.stringify([f?.repeat_after, f?.repeat_mode, f?.due_date]));
await ctx.close();

// #579: phone, Inbox, a project from the row: stays in the Inbox, not validated
const pctx = await browser.newContext({ ...devices['Pixel 5'] });
await pctx.addInitScript(init, [api, jwt]);
const ph = await pctx.newPage();
const it = await req('PUT', `/api/v1/projects/${inbox.id}/tasks`, { title: `phone file ${st}` }); made.push(it);
await ph.goto(base + '/inbox'); await ph.waitForTimeout(5000);
const row = ph.locator('.row', { hasText: `phone file ${st}` });
await row.locator('.title').dispatchEvent('contextmenu'); await ph.waitForTimeout(600);
await ph.getByRole('button', { name: /^Project/ }).tap(); await ph.waitForTimeout(500);
await ph.keyboard.type(`Nov20 ${st}`); await ph.waitForTimeout(500);
await ph.getByText(`Nov20 ${st}`, { exact: true }).last().tap(); await ph.waitForTimeout(3000);
s = await req('GET', `/api/v1/tasks/${it.id}`);
check('#579 phone: the project is set', s.project_id === P.id, s.project_id);
check('…but it is not validated', !titles(s).includes('ctx:validated'), titles(s));
check('…and still on the Inbox page, to finish it', ph.url().endsWith('/inbox') && (await ph.locator('.row', { hasText: `phone file ${st}` }).count()) === 1, ph.url());
await browser.close();
for (const t of [...made, wk, og]) if (t?.id) await req('DELETE', `/api/v1/tasks/${t.id}`);
await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
