// The Inbox is a page of its own, first in the menu; Home is only the house in the top bar
// (13 Nov 2026). TEST Vikunja only. Usage: node e2e/inbox-page.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const inbox = (await req('GET', '/api/v1/projects')).find((p) => p.title.toLowerCase() === 'inbox' && !p.parent_project_id);
const title = `Inbox page ${Date.now().toString(36).slice(-4)}`;
await req('PUT', `/api/v1/projects/${inbox.id}/tasks`, { title });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [w, h, label] of [[1280, 900, 'computer'], [390, 844, 'phone']]) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	// A device that had the Inbox saved as its view.
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); localStorage.setItem('view', 'input'); }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(5000);
	check(`${label}: home opens on All for a device that had the Inbox view`, (await p.getByRole('radio', { name: 'All', exact: true }).getAttribute('aria-checked')) === 'true');
	const opts = (await p.locator('.views').getByRole('radio').allInnerTexts()).map((s) => s.trim());
	check(`${label}: the views are All, Pro, Perso`, opts.join() === 'All,Pro,Perso', opts.join());
	if (label === 'phone') { await p.getByRole('button', { name: /menu/i }).first().click().catch(() => {}); await p.waitForTimeout(500); }
	const places = (await p.locator('nav.places a').allInnerTexts()).map((s) => s.trim());
	check(`${label}: menu starts with Inbox, no Home`, places[0] === 'Inbox' && !places.includes('Home'), places.join(' | '));
	await p.locator('nav.places a', { hasText: 'Inbox' }).click(); await p.waitForTimeout(2000);
	check(`${label}: Inbox link opens /inbox`, new URL(p.url()).pathname === '/inbox', p.url());
	check(`${label}: page title Inbox`, (await p.locator('h1').first().innerText()).trim() === 'Inbox');
	check(`${label}: the new task is listed`, (await p.getByText(title).count()) > 0);
	await p.getByRole('link', { name: 'Go to home page' }).click(); await p.waitForTimeout(1500);
	check(`${label}: the house goes home`, new URL(p.url()).pathname === '/', p.url());
	await p.goto(base + '/?view=inbox'); await p.waitForTimeout(3000);
	check(`${label}: /?view=inbox opens the Inbox page`, new URL(p.url()).pathname === '/inbox', p.url());
	await p.goto(base + '/'); await p.waitForTimeout(2500);
	await p.keyboard.press('g'); await p.keyboard.press('i'); await p.waitForTimeout(1500);
	if (label === 'computer') check('g i opens the Inbox page', new URL(p.url()).pathname === '/inbox', p.url());
	await ctx.close();
}
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
