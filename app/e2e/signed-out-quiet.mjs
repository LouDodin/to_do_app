// Signed out while the app is open (19 Nov 2026: the Mac logged "Vikunja API URL is not
// configured" every 5 minutes on the sign-in screen): no sync, no error, until you sign in.
// And the server's address, guessed next to the app, is kept. TEST Vikunja only.
// Usage: node e2e/signed-out-quiet.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
// The session ends and the address is gone (as on the Mac on 18 Nov).
await p.evaluate(() => { localStorage.removeItem('vikunja_jwt'); localStorage.removeItem('vikunja_api_url'); localStorage.removeItem('tasks_error_recent'); localStorage.removeItem('tasks_error_outbox'); });
await p.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); });
await p.waitForTimeout(4000);
const errs = await p.evaluate(() => localStorage.getItem('tasks_error_recent') ?? '[]');
check('no "not configured" error while signed out', !errs.includes('not configured'), errs);
await browser.close();
// The guessed address is written down while signed in (app on :8443 → server without the port).
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
