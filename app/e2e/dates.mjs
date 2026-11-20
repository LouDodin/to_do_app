// Dates (11 Nov 2026): choosing a day is enough, and it is kept when you click elsewhere to close
// the window (the old "date and time" box saved nothing until a time was typed too). Row
// popovers, the task page and the phone's long-press menu. TEST Vikunja only.
// Usage: node e2e/dates.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const st = Date.now().toString(36).slice(-5);
const P = await req('PUT', '/api/v1/projects', { title: `Dates ${st}` });
const T = [];
for (const name of ['row', 'page', 'phone']) { T.push(await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `${name} ${st}` })); await wait(1100); }
const get = (id) => req('GET', `/api/v1/tasks/${id}`);
// Read back in the browser's time zone (Paris), as the user sees it.
const local = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 16);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts) => {
	const ctx = await browser.newContext({ ...opts, timezoneId: 'Europe/Paris' });
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};

{
	const { ctx, p } = await open({ viewport: { width: 1300, height: 860 } });
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
	const row = p.locator('main .row', { hasText: `row ${st}` });
	// Due: pick only a day, then click elsewhere
	await row.getByRole('button', { name: 'Change due date' }).click(); await p.waitForTimeout(300);
	await p.locator('.pop input[type=date]').fill('2026-12-03');
	await p.mouse.click(1200, 820); await wait(3000);
	check('row: only a due day, then a click elsewhere: kept (end of the day)', local((await get(T[0].id)).due_date) === '2026-12-03 23:59', (await get(T[0].id)).due_date);
	check('…and the window closed', (await p.locator('.pop input[type=date]').count()) === 0);
	await row.getByRole('button', { name: 'Change start date' }).click(); await p.waitForTimeout(300);
	await p.locator('.pop input[type=date]').fill('2026-12-01');
	await p.keyboard.press('Escape'); await wait(3000);
	check('row: a start day, then Esc: kept too (09:00)', local((await get(T[0].id)).start_date) === '2026-12-01 09:00', (await get(T[0].id)).start_date);
	// Task page: day, then time
	await p.goto(`${base}/task/${T[1].id}`); await p.waitForTimeout(2000);
	const due = p.getByRole('group', { name: 'Due' });
	await due.locator('input[type=date]').fill('2026-12-10');
	await p.locator('.notes-head').click(); await wait(3000);
	check('task page: a due day, then a click elsewhere: kept', local((await get(T[1].id)).due_date) === '2026-12-10 23:59', (await get(T[1].id)).due_date);
	await due.locator('input[type=time]').fill('14:30');
	await p.locator('.notes-head').click(); await wait(3000);
	check('task page: then a time: kept with the time', local((await get(T[1].id)).due_date) === '2026-12-10 14:30', (await get(T[1].id)).due_date);
	await p.getByRole('button', { name: 'Remove the due date' }).click(); await wait(3000);
	const g = await get(T[1].id);
	check('task page: × removes the date', !g.due_date || g.due_date.startsWith('0001'), g.due_date);
	await ctx.close();
}
{
	const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
	await p.locator('main .row', { hasText: `phone ${st}` }).dispatchEvent('contextmenu'); await p.waitForTimeout(600);
	await p.getByRole('button', { name: /Due date/ }).click(); await p.waitForTimeout(400);
	await p.locator('[role=dialog] input[type=date]').fill('2026-12-05');
	await p.mouse.click(195, 60); await wait(3000);
	check('phone menu: a due day, then a tap outside: kept', local((await get(T[2].id)).due_date) === '2026-12-05 23:59', (await get(T[2].id)).due_date);
	await ctx.close();
}

console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
