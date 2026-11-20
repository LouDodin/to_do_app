// Sections never wiped by a device that has not received them yet, and put back from a restore
// file (13 Nov 2026: Lou's sections of a project were wiped that way). TEST Vikunja only.
// Usage: node e2e/sections-safe.mjs <app> <api> <user> <pass> <stateDir>
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const [base, api, user, pass, stateDir] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Safe ${st}` });
const Q = await req('PUT', '/api/v1/projects', { title: `Restore ${st}` });
const account = async () => (await req('GET', '/api/v1/user'))?.settings?.frontend_settings?.tasks_sections ?? {};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (extra = {}) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addInitScript(([a, j, x]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, [api, jwt, extra]);
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());
	await p.goto(base + '/'); await p.waitForTimeout(5000);
	return { ctx, p };
};
// Device A makes two sections.
{
	const { ctx, p } = await open();
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
	for (const s of ['One', 'Two']) { await p.getByPlaceholder('New section…').fill(s); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
	await p.waitForTimeout(5000);
	await ctx.close();
}
let m = await account();
check('device A: the two sections are in the account', m[String(P.id)]?.s?.length === 2, JSON.stringify(m[String(P.id)]));
// Device B has never received them, and has a change of its own waiting for that project.
{
	const { ctx, p } = await open({ tasks_sections_dirty: JSON.stringify([String(P.id)]), tasks_sections_seen: '{}' });
	await p.waitForTimeout(8000);
	m = await account();
	check('device B (stale) did not wipe them', m[String(P.id)]?.s?.length === 2, JSON.stringify(m[String(P.id)]));
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
	check('device B now shows them', (await p.locator('.section-header h2').count()) === 2);
	await ctx.close();
}
// A restore file for project Q (no sections in the account): written back into the account once.
mkdirSync(`${stateDir}/sections-restore`, { recursive: true });
writeFileSync(`${stateDir}/sections-restore/${user}.json`, JSON.stringify({ id: `t-${st}`, projects: { [String(Q.id)]: { u: 1, s: [[-11, 'Restored A', 0], [-12, 'Restored B', 1]], a: {}, o: {} } } }));
{
	const { ctx, p } = await open();
	await p.waitForTimeout(6000);
	m = await account();
	check('restore: the sections are back in the account', m[String(Q.id)]?.s?.map((x) => x[1]).join() === 'Restored A,Restored B', JSON.stringify(m[String(Q.id)]));
	await p.goto(`${base}/project/${Q.id}`); await p.waitForTimeout(2500);
	check('restore: shown on the project page', (await p.locator('.section-header h2').allInnerTexts()).map((x) => x.trim()).join() === 'Restored A,Restored B');
	await p.locator('.sec', { has: p.locator('h2', { hasText: 'Restored B' }) }).getByRole('button', { name: 'Section actions' }).click();
	await p.getByRole('button', { name: 'Delete the section' }).click(); await p.waitForTimeout(5000);
	await p.reload(); await p.waitForTimeout(5000);
	m = await account();
	check('restore: applied once (a section deleted afterwards stays deleted)', m[String(Q.id)]?.s?.length === 1, JSON.stringify(m[String(Q.id)]));
	await ctx.close();
}
rmSync(`${stateDir}/sections-restore/${user}.json`);
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
