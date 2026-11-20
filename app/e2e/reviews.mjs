// Tomorrow's priorities and the Weekly review, redone 13 Nov 2026: few sections, only what is
// ahead, no figures. TEST Vikunja only. Usage: node e2e/reviews.mjs <app> <api> <user> <pass> [shots]
import { chromium } from 'playwright-core';
const [base, api, user, pass, shots] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
// Retried: the test server sometimes refuses a write under load (database locked).
const req = async (m, p, b) => {
	for (let k = 0; k < 6; k++) {
		const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).catch(() => null);
		if (r && r.ok) return r.json().catch(() => null);
		if (r && r.status < 500 && r.status !== 429 && !(m === 'PUT' && /labels$/.test(p) && r.status === 409)) return r.json().catch(() => null);
		await new Promise((res) => setTimeout(res, 400 * (k + 1)));
	}
	return null;
};
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const labels = await req('GET', '/api/v1/labels?per_page=500');
const L = async (title, hex = '888888') => labels.find((l) => l.title === title) ?? (await req('PUT', '/api/v1/labels', { title, hex_color: hex }));
const [valid, today, week, nextA] = [await L('ctx:validated'), await L('today', '000000'), await L('week', '1e88e5'), await L('next-action')];
const P = await req('PUT', '/api/v1/projects', { title: `Reviews ${st}` });
const mk = async (title, ls, extra = {}) => { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title, ...extra }); for (const l of [valid, ...ls]) await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: l.id }); return t; };
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(), past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
const leftT = await mk(`left from today ${st}`, [today]);           // planned today, not done, still on the list
const droppedT = await mk(`dropped today ${st}`, []);              // planned today, then taken off
const doneT = await mk(`done today ${st}`, []);                    // planned today and done
const pastT = await mk(`planned on a past day ${st}`, []);         // planned 3 days ago, not done
const weekT = await mk(`on the week list ${st}`, [week]);
const nextT = await mk(`a next action ${st}`, [nextA]);
await req('POST', `/api/v1/tasks/${doneT.id}`, { ...doneT, done: true });
// The day plans in the account (as the app writes them).
const me = await req('GET', '/api/v1/user');
const fs = me.settings.frontend_settings ?? {};
const plans = fs.tasks_day_plans ?? {};
plans[key(now)] = [...new Set([...(plans[key(now)] ?? []), leftT.id, droppedT.id, doneT.id])];
plans[key(past)] = [...new Set([...(plans[key(past)] ?? []), pastT.id])];
await req('POST', '/api/v1/user/settings/general', { ...me.settings, frontend_settings: { ...fs, tasks_day_plans: plans } });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
const step = (id) => p.locator(`[data-step="${id}"]`);
const has = async (id, text) => (await step(id).getByText(text, { exact: true }).count()) > 0;
const grp = (name) => p.locator(`[data-group="${name}"]`);
const hasG = async (name, text) => (await grp(name).getByText(text, { exact: true }).count()) > 0;

// ---- Tomorrow
await p.goto(base + '/today-review'); await p.waitForTimeout(3500);
for (let k = 0; k < 20 && !((await p.locator('.review').innerText()).includes(`dropped today ${st}`) && (await p.locator('.review').innerText()).includes(`a next action ${st}`)); k++) { await p.waitForTimeout(1500); if (k === 8) await p.reload(); }
if (process.env.DBG) { console.log((await p.locator('.review').innerText()).slice(0, 1500)); await p.screenshot({ path: '/tmp/claude-0/-home-claude/8f7b8f98-068f-5363-98d2-bf8b341f46af/scratchpad/rv/dbg.png', fullPage: true }); }
const titles = (await p.locator('.step > .head .title').allInnerTexts()).map((s) => s.trim());
check('tomorrow: three sections: Clean the Inbox, Your list for tomorrow, To consider (14 Nov 2026)', titles.join('|') === 'Clean the Inbox|Your list for tomorrow|To consider', titles.join('|'));
check('tomorrow: Clean the Inbox: only Open goes to the Inbox, the box is not a link', (await step('inbox').locator('a[href="/inbox"]').innerText()).includes('Open') && (await step('inbox').locator('a .box').count()) === 0);
const ibox = () => step('inbox').getByRole('checkbox', { name: 'Inbox' });
const openStep = async (id) => { const f = step(id).locator('.fold'); if ((await f.getAttribute('aria-expanded')) === 'false') { await f.click(); await p.waitForTimeout(300); } };
await openStep('inbox');
const before = await ibox().getAttribute('aria-checked');
await ibox().click(); await p.waitForTimeout(500);
await openStep('inbox');
check('tomorrow: a click on the box ticks it by hand and stays on the page', new URL(p.url()).pathname === '/today-review' && (await ibox().getAttribute('aria-checked')) !== before);
const handTick = await ibox().getAttribute('aria-checked');
await step('inbox').locator('a.open').click().catch(async () => { await p.goto(base + '/inbox'); }); await p.waitForTimeout(800);
await p.goBack(); await p.waitForTimeout(1500); await openStep('inbox');
check('tomorrow: the hand tick is kept after going to the Inbox and back', (await ibox().getAttribute('aria-checked')) === handTick);
await p.reload(); await p.waitForTimeout(4000); await openStep('inbox');
check('tomorrow: …and forgotten when the page is reloaded', (await ibox().getAttribute('aria-checked')) === before);
check('tomorrow: the page is called Tomorrow', (await p.locator('h1').first().innerText()).trim() === 'Tomorrow');
const groupNames = (await step('consider').locator('.group').allInnerTexts()).map((x) => x.replace('›', '').trim());
check('tomorrow: Planned for today, not done is the first group of To consider', groupNames[0] === 'Planned for today, not done', groupNames.join('|'));
check('tomorrow: no figures', (await p.locator('.stat, .step .count').count()) === 0);
check('tomorrow: no past work (no summary of what was done)', !(await p.locator('.review').innerText()).includes(`done today ${st}`));
check('tomorrow: left from today is in the first section, starred (still on the list)', await hasG('Planned for today, not done', `left from today ${st}`) && (await grp('Planned for today, not done').locator('.slot', { hasText: `left from today ${st}` }).locator('.choose.on').count()) === 1);
check('tomorrow: one taken off today is there too, not starred', await hasG('Planned for today, not done', `dropped today ${st}`) && (await grp('Planned for today, not done').locator('.slot', { hasText: `dropped today ${st}` }).locator('.choose.on').count()) === 0);
check('tomorrow: … and not again in the list for tomorrow', !(await has('chosen', `left from today ${st}`)));
check('tomorrow: a moon (not a star) to choose', (await step('consider').locator('.choose svg').count()) > 0 && !(await p.locator('.review').innerText()).match(/[☆★]/));
check('tomorrow: the week’s list is among the tasks to consider', await has('consider', `on the week list ${st}`));
check('tomorrow: and a next action', await has('consider', `a next action ${st}`));
await step('consider').locator('.slot', { hasText: `a next action ${st}` }).getByRole('button', { name: "Add it to tomorrow's list", exact: true }).click(); await p.waitForTimeout(2500);
check('tomorrow: ☆ moves it to Your list for tomorrow', await has('chosen', `a next action ${st}`) && !(await has('consider', `a next action ${st}`)));
const plans2 = (await req('GET', '/api/v1/user')).settings.frontend_settings.tasks_day_plans;
const tomorrowKey = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
check('tomorrow: chosen tonight counts for tomorrow, not as planned for today', (plans2[tomorrowKey] ?? []).includes(nextT.id) && !(plans2[key(now)] ?? []).includes(nextT.id), JSON.stringify({ t: plans2[key(now)], tm: plans2[tomorrowKey] }));
if (shots) await p.screenshot({ path: `${shots}/tomorrow.png`, fullPage: true });

// ---- Weekly
await p.goto(base + '/weekly'); await p.waitForTimeout(3500);
const wt = (await p.locator('.step > .head .title').allInnerTexts()).map((s) => s.trim());
check('weekly: three sections: Clean up, Projects and tasks on hold, Plan the coming week', wt.join('|') === 'Clean up|Projects and tasks on hold|Plan the coming week', wt.join('|'));
const wGroups = (await step('plan').locator('.group').allInnerTexts()).map((x) => x.replace('›', '').trim());
check('weekly: Plan the coming week: Your list for the week, then Planned this week, not done', wGroups[0] === 'Your list for the week' && wGroups[1] === 'Planned this week, not done', wGroups.join('|'));
check('weekly: no figures, nothing finished listed', (await p.locator('.stat, .step .count').count()) === 0 && !(await p.locator('.review').innerText()).includes(`done today ${st}`));
await openStep('clean');
const wb = step('clean').getByRole('checkbox', { name: 'Inbox' });
const wBefore = await wb.getAttribute('aria-checked');
await wb.click(); await p.waitForTimeout(500); await openStep('clean');
check('weekly: the Inbox box can be ticked by hand, on the page', new URL(p.url()).pathname === '/weekly' && (await wb.getAttribute('aria-checked')) !== wBefore);
await wb.click(); await p.waitForTimeout(300);
const wRow = step('clean').locator('.rtick.inbox');
await p.mouse.move(5, 5); await p.waitForTimeout(300);
const bg0 = await wRow.evaluate((e) => getComputedStyle(e).backgroundColor);
await wRow.hover({ position: { x: 300, y: 10 } }); await p.waitForTimeout(300);
const bgH = await wRow.evaluate((e) => getComputedStyle(e).backgroundColor);
const em = step('clean').locator('.rtick', { hasText: 'Emails' }); await em.hover(); await p.waitForTimeout(300);
check('weekly: the Inbox line greys on hover, like Emails', bgH !== bg0 && bgH === (await em.evaluate((e) => getComputedStyle(e).backgroundColor)), `${bg0} ${bgH}`);
const w0 = await wb.getAttribute('aria-checked');
await step('clean').locator('.rtick.inbox .rlabel').click(); await p.waitForTimeout(400);
check('weekly: a click on the line ticks it too (not on Open)', (await wb.getAttribute('aria-checked')) !== w0 && new URL(p.url()).pathname === '/weekly');
await p.reload(); await p.waitForTimeout(3500);
check('weekly: Clean up has Desktop, Downloads, Emails and the Inbox', (await step('clean').innerText()).match(/Desktop[\s\S]*Downloads[\s\S]*Emails[\s\S]*Inbox/) !== null, await step('clean').innerText());
for (const t of [`left from today ${st}`, `dropped today ${st}`, `planned on a past day ${st}`, `on the week list ${st}`]) check(`weekly: "${t.replace(' ' + st, '')}" is in the group Planned this week, not done`, await hasG('Planned this week, not done', t));
check('weekly: a next action is in Plan the coming week', await has('plan', `a next action ${st}`));
check('weekly: it shows it is on tomorrow’s list (chosen above)', (await step('plan').locator('.slot', { hasText: `a next action ${st}` }).locator('.choose.on[aria-label="Tomorrow"]').count()) === 1);
const sl = step('plan').locator('.slot').first();
const [pw, pm] = await sl.locator('.choose').all();
const bw = await pw.boundingBox(), bm = await pm.boundingBox();
check('weekly (computer): the week calendar then the Tomorrow moon, side by side on the row', Math.abs(bw.y - bm.y) < 2 && bm.x > bw.x && (await pw.getAttribute('aria-label')).includes("week's list") && (await pm.getAttribute('aria-label')) === 'Tomorrow', JSON.stringify({ bw, bm }));
check('no stars left on the review pages', !(await p.locator('.review').innerText()).match(/[☆★]/));
const row = grp('Planned this week, not done').locator('.slot', { hasText: `planned on a past day ${st}` });
await row.getByRole('button', { name: "Add it to the week's list", exact: true }).click(); await p.waitForTimeout(1500);
await row.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await p.waitForTimeout(2500);
const pt = (await req('GET', `/api/v1/projects/${P.id}/tasks`)).find?.((x) => x.id === pastT.id) ?? (await req('GET', `/api/v1/tasks/${pastT.id}`));
const pl = (pt.labels || []).map((l) => l.title);
check('weekly: ☆ puts it on the week’s list and Tomorrow on tomorrow’s', pl.includes('week') && pl.includes('today'), JSON.stringify(pl));
if (shots) await p.screenshot({ path: `${shots}/weekly.png`, fullPage: true });
// phone
const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ph.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const q = await ph.newPage();
for (const path of ['/weekly', '/today-review']) {
	await q.goto(base + path); await q.waitForTimeout(4000);
	const over = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	check(`phone ${path}: no sideways scrolling`, over <= 1, over);
	if (shots) await q.screenshot({ path: `${shots}/phone-${path.slice(1)}.png`, fullPage: true });
}
await browser.close();
await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
