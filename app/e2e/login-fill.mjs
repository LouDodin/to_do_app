// The sign-in page for password managers (13 Nov 2026, Bitwarden on the phone): the server box is
// hidden when the server is known, the two boxes are named username / password with the
// standard autocomplete values, and nothing else is offered to fill. TEST Vikunja only.
// Usage: node e2e/login-fill.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const opts of [{ viewport: { width: 1280, height: 800 } }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
	const tag = opts.isMobile ? 'phone' : 'computer';
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript((a) => localStorage.setItem('vikunja_api_url', a), api);
	const p = await ctx.newPage();
	await p.goto(base + '/login'); await p.waitForTimeout(1500);
	const fields = await p.locator('form input').evaluateAll((els) => els.map((e) => [e.type, e.name, e.id, e.getAttribute('autocomplete')].join('|')));
	check(`${tag}: only the two sign-in boxes, named for password managers`, JSON.stringify(fields) === JSON.stringify(['text|username|username|username', 'password|password|password|current-password']), JSON.stringify(fields));
	await p.getByRole('button', { name: 'Change server' }).click();
	check(`${tag}: "Change server" shows the server box, ignored by password managers`, (await p.locator('input[name=server]').getAttribute('data-bwignore')) === 'true');
	await p.fill('#username', user); await p.fill('#password', pass);
	await p.locator('button[type=submit]').click();
	await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 8000 }).catch(() => {});
	check(`${tag}: signed in`, !p.url().includes('/login'), p.url());
	await ctx.close();
}
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
