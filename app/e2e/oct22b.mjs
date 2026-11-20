// 22 Oct 2026 (evening): what the warnings revealed.
// Usage: node e2e/oct22b.mjs <app> <api> <user> <pass> <servedAppDir> <buildA> <buildB> <stateDir>
//  - an app left open across an update recovers by itself (no "500")
//  - devices tell the PC their version (state/devices.json)
//  - switching views does not make the Inbox safety net write false alarms
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const [base, api, user, pass, served, A, B, stateDir] = process.argv.slice(2);
const swap = (dir) => execSync(`rm -rf ${served} && cp -r ${dir} ${served}`);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS ' : 'FAIL ', name, cond ? '' : '→ ' + String(got).slice(0, 300)); };
const open = async (view = 'all') => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
	await ctx.addInitScript(([a, j, v]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', v); } }, [api, jwt, view]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(5000);
	return { ctx, p };
};

// ---------- left open across an update ----------
{
	swap(A);
	const { ctx, p } = await open();
	await p.evaluate(() => { window.__marker = 1; });
	swap(B);
	await p.evaluate(() => { const a = document.createElement('a'); a.href = '/weekly'; document.body.appendChild(a); a.click(); });
	await p.waitForTimeout(6000);
	const body = await p.locator('body').innerText();
	check('no "500 Internal Error" left on screen', !/Internal Error|could not open/.test(body), body.slice(0, 200));
	check('the page asked for opened', p.url().endsWith('/weekly'), p.url());
	check('by reloading once (new version loaded)', (await p.evaluate(() => window.__marker)) === undefined);
	await ctx.close();
}

// ---------- the error page ----------
{
	const { ctx, p } = await open();
	await p.goto(base + '/task/999999999'); await p.waitForTimeout(1500);
	await p.goto(base + '/no-such-page/x'); await p.waitForTimeout(2500);
	const body = await p.locator('body').innerText();
	check('an unknown page says so, with Reload and Home', /does not exist|could not open/.test(body) && (await p.getByRole('button', { name: 'Reload' }).count()) === 1, body.slice(0, 200));
	await ctx.close();
}

// ---------- devices report their version ----------
{
	fs.rmSync(`${stateDir}/devices.json`, { force: true });
	const { ctx, p } = await open();
	await p.waitForTimeout(14000); // first report after 15 s
	let devs = {};
	try { devs = JSON.parse(fs.readFileSync(`${stateDir}/devices.json`, 'utf8')); } catch {}
	const live = fs.readFileSync(`${served}/version.txt`, 'utf8').trim().slice(0, 16).replace('T', ' ');
	const mine = Object.entries(devs)[0];
	check('the device told the PC its version', mine && mine[1].build === live, JSON.stringify(devs) + ' live ' + live);
	await ctx.close();
}

// ---------- no false alarms when switching views ----------
{
	const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
	const projects = await (await fetch(`${api}/api/v1/projects`, { headers: H })).json();
	const inbox = projects.find((x) => /^inbox$/i.test(x.title));
	for (let i = 1; i <= 3; i++) await fetch(`${api}/api/v1/projects/${inbox.id}/tasks`, { method: 'PUT', headers: H, body: JSON.stringify({ title: `inbox switch ${i} ${Date.now().toString(36)}` }) });
	const { ctx, p } = await open('input');
	await p.waitForTimeout(1500);
	const rows = await p.locator('.row:has(.checkbox)').count();
	const pick = async (label) => { await p.locator('button.trigger').first().click(); await p.waitForTimeout(150); await p.getByRole('option', { name: label, exact: true }).click(); await p.waitForTimeout(700); };
	for (let i = 0; i < 3; i++) { await pick('All'); await pick('Pro'); await pick('Inbox'); }
	const traces = await p.evaluate(() => JSON.parse(localStorage.getItem('tasks_error_recent') || '[]').filter((e) => e.kind === 'trace').length);
	check(`switching between Inbox and Home several times (${rows} tasks in the Inbox): no trace written`, traces === 0, traces);
	await ctx.close();
}
console.log(`${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
