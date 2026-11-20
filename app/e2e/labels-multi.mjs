// Several labels at once (11 Nov 2026): in the menu, a label adds itself to the list shown or
// takes itself off; the list follows live; All of them / Any of them. TEST Vikunja only.
// Usage: node e2e/labels-multi.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const st = Date.now().toString(36).slice(-4);
const LA = await req('PUT', '/api/v1/labels', { title: `alpha${st}`, hex_color: 'e8445a' });
const LB = await req('PUT', '/api/v1/labels', { title: `beta${st}`, hex_color: '1973ff' });
const P = await req('PUT', '/api/v1/projects', { title: `Labels ${st}` });
const mk = async (title, labels) => {
	const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title });
	for (const l of labels) for (let i = 0; i < 5; i++) { // checked: a write can fail while the test server is busy
		await req('PUT', `/api/v1/tasks/${t.id}/labels`, { label_id: l.id });
		if (((await req('GET', `/api/v1/tasks/${t.id}`)).labels ?? []).some((x) => x.id === l.id)) break;
		await wait(800);
	}
	await wait(1100); return t;
};
await mk(`only a ${st}`, [LA]); await mk(`only b ${st}`, [LB]); await mk(`both ${st}`, [LA, LB]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};
const titles = async (p) => (await p.locator('main .row .title').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.endsWith(st)).sort();
const chip = (p, l) => p.locator('aside .chip-link', { hasText: l.title });
{
	const { ctx, p } = await open({ viewport: { width: 1300, height: 860 } });
	await p.getByPlaceholder('Find a label').fill(st);
	await chip(p, LA).click(); await p.waitForTimeout(800);
	check('one label: its tasks', JSON.stringify(await titles(p)) === JSON.stringify([`both ${st}`, `only a ${st}`].sort()), JSON.stringify(await titles(p)));
	await chip(p, LB).click(); await p.waitForTimeout(800);
	check('a second label in the menu: both, at once (tasks with all of them)', new URL(p.url()).pathname === `/label/${LA.id}+${LB.id}` && JSON.stringify(await titles(p)) === JSON.stringify([`both ${st}`]), p.url() + ' ' + JSON.stringify(await titles(p)));
	check('…both marked in the menu', (await chip(p, LA).getAttribute('aria-pressed')) === 'true' && (await chip(p, LB).getAttribute('aria-pressed')) === 'true');
	await p.getByRole('button', { name: 'Any of them' }).click(); await p.waitForTimeout(800);
	check('Any of them: every task with one or the other', (await titles(p)).length === 3 && p.url().endsWith('?any=1'), JSON.stringify(await titles(p)));
	await chip(p, LA).click(); await p.waitForTimeout(800);
	check('a click on a marked label takes it off', new URL(p.url()).pathname === `/label/${LB.id}` && JSON.stringify(await titles(p)) === JSON.stringify([`both ${st}`, `only b ${st}`].sort()), p.url());
	await p.getByRole('button', { name: 'Add a label' }).click(); await p.locator('.pop input').fill(`alpha${st}`); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
	check('+ on the page adds one', new URL(p.url()).pathname === `/label/${LB.id}+${LA.id}`, p.url());
	await p.getByRole('button', { name: `Take beta${st} off` }).click(); await p.waitForTimeout(800);
	check('× on the page takes one off', new URL(p.url()).pathname === `/label/${LA.id}`, p.url());
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(1500);
	await p.getByPlaceholder('Find a label').fill(st);
	await chip(p, LB).click(); await p.waitForTimeout(800);
	check('from another page, a label opens alone', new URL(p.url()).pathname === `/label/${LB.id}`);
	await ctx.close();
}
{
	const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await p.getByRole('button', { name: /^Menu/ }).click(); await p.waitForTimeout(500);
	await p.getByPlaceholder('Find a label').fill(st);
	await chip(p, LA).tap(); await p.waitForTimeout(1000);
	check('phone: a label opens its list (the menu closes)', new URL(p.url()).pathname === `/label/${LA.id}` && (await p.locator('aside.side').count()) === 0);
	await p.getByRole('button', { name: 'Add a label' }).tap(); await p.locator('.pop input').fill(`beta${st}`); await p.locator('.pop .opt').first().tap(); await p.waitForTimeout(1000);
	check('phone: + adds a second label; the list shows tasks with both', new URL(p.url()).pathname === `/label/${LA.id}+${LB.id}` && JSON.stringify(await titles(p)) === JSON.stringify([`both ${st}`]), p.url() + JSON.stringify(await titles(p)));
	await ctx.close();
}
console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
