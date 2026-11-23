// 23 Nov 2026: Settings › Pages and features (per account, all devices; everything by default).
// TEST Vikunja only. Usage: node e2e/nov23.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const hiddenOnAccount = async () => (await (await fetch(api + '/api/v1/user', { headers: H })).json()).settings?.frontend_settings?.tasks_hidden_features;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const device = async () => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addInitScript(([x, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', x); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); localStorage.setItem('view', 'Pro'); }, [api, jwt]);
	return ctx.newPage();
};
const p = await device();
await p.goto(base + '/settings?tab=settings'); await p.waitForTimeout(5000);
const sec = p.locator('section.features');
check('Settings: Pages and features, everything ticked by default', (await sec.locator('input[type=checkbox]').count()) >= 13 && (await sec.locator('input[type=checkbox]:not(:checked)').count()) === 0, await sec.locator('input[type=checkbox]:not(:checked)').count());
for (const name of ['Upcoming', 'Red', 'All / Pro / Perso', 'Shopping', 'Reminders']) await sec.getByLabel(name, { exact: false }).first().uncheck();
await p.waitForTimeout(2500);
const h = (await hiddenOnAccount()) ?? [];
check('…unticked: saved on the account', ['page:upcoming', 'home:red', 'area-switch', 'page:shopping', 'reminders'].every((k) => h.includes(k)), JSON.stringify(h));
await p.goto(base + '/'); await p.waitForTimeout(3000);
check('menu: no Upcoming, no Shopping; the others stay', (await p.locator('nav.places a[href="/upcoming"]').count()) === 0 && (await p.locator('nav.places a[href="/shopping"]').count()) === 0 && (await p.locator('nav.places a[href="/weekly"]').count()) === 1);
check('home: no Red block; Today still there', (await p.locator('h2', { hasText: /^Red$/ }).count()) === 0 && (await p.locator('h2', { hasText: /^Today$/ }).count()) === 1);
check('top bar: no All / Pro / Perso, and everything is shown (All)', (await p.getByRole('radio', { name: 'Pro' }).count()) === 0 && (await p.evaluate(() => localStorage.getItem('view'))) === 'all', await p.evaluate(() => localStorage.getItem('view')));
await p.keyboard.press('n'); await p.waitForTimeout(600);
const dlg = p.getByRole('dialog', { name: 'New task' });
check('new task window: no cart, no Remind', (await dlg.getByRole('button', { name: 'Shopping' }).count()) === 0 && (await dlg.getByRole('button', { name: 'Reminder' }).count()) === 0);
await p.keyboard.press('Escape');
await p.keyboard.press('g'); await p.keyboard.press('c'); await p.waitForTimeout(800);
check('the g c shortcut no longer opens Upcoming', !p.url().endsWith('/upcoming'), p.url());
const q = await device();
await q.goto(base + '/'); await q.waitForTimeout(5000);
check('another device: the same choice', (await q.locator('nav.places a[href="/upcoming"]').count()) === 0 && (await q.locator('h2', { hasText: /^Red$/ }).count()) === 0);
await p.goto(base + '/settings?tab=settings'); await p.waitForTimeout(2500);
for (let k = 0; k < 20 && (await sec.locator('input[type=checkbox]:not(:checked)').count()); k++) { await sec.locator('input[type=checkbox]:not(:checked)').first().check(); await p.waitForTimeout(300); }
await p.waitForTimeout(2500);
check('ticked again: everything back', ((await hiddenOnAccount()) ?? []).length === 0, JSON.stringify(await hiddenOnAccount()));
await p.goto(base + '/'); await p.waitForTimeout(2500);
check('…menu and home as before', (await p.locator('nav.places a[href="/upcoming"]').count()) === 1 && (await p.locator('h2', { hasText: /^Red$/ }).count()) === 1 && (await p.getByRole('radio', { name: 'Pro' }).count()) === 1);
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
