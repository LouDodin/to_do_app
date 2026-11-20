// An app left open while a new version goes live must end up on the new version by itself, with
// the service worker on (the real set-up). 25 Oct 2026: it reloaded before the new version was
// installed on the device, got the old one again from its cache, and stopped trying.
// Usage: node e2e/sw-update.mjs <app> <api> <user> <pass> <servedAppDir> <buildA> <buildB>
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const [base, api, user, pass, served, A, B] = process.argv.slice(2);
const swap = (dir) => execSync(`rm -rf ${served} && cp -r ${dir} ${served}`);
const ver = (dir) => fs.readFileSync(`${dir}/version.txt`, 'utf8').trim().slice(0, 16).replace('T', ' ');
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS ' : 'FAIL ', name, cond ? '' : '→ ' + got); };
swap(A);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (!localStorage.getItem('vikunja_jwt')) { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); } }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(4000);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload(); await p.waitForTimeout(3000); // now served by the service worker, as on your devices
const build = () => p.evaluate(async () => (await (await fetch('/_app/version.json', { cache: 'no-store' }).catch(() => null))?.text?.()) ?? '');
const shown = async () => { await p.goto(base + '/settings'); await p.waitForTimeout(1500); return ((await p.locator('body').innerText()).match(/Build (\d{4}-\d\d-\d\d \d\d:\d\d)/) || [])[1]; };
check('starts on version A', (await shown()) === ver(A), await shown());
await p.goto(base + '/'); await p.waitForTimeout(2000);
await p.evaluate(() => { window.__marker = 1; });
swap(B);
// A slow connection (the Mac over the internet): every file of the new version takes a while.
if (process.env.SLOW) await ctx.route('**/_app/immutable/**', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // what coming back to the app does
let reloaded = false;
for (let i = 0; i < 40 && !reloaded; i++) { await p.waitForTimeout(1500); reloaded = (await p.evaluate(() => window.__marker).catch(() => undefined)) === undefined; }
check('the app reloaded by itself', reloaded);
await p.waitForTimeout(2000);
check('and now runs version B', (await shown()) === ver(B), `${await shown()} (B: ${ver(B)})`);
console.log(`${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
