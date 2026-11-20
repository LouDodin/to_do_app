// The labels the app and the automations use come first in the menu, on a line of their own
// (14 Nov 2026). TEST Vikunja only. Usage: node e2e/system-labels.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const SYS = ['today', 'week', 'next-action', 'p1', 'overdue', 'last-day', 'waiting-for', 'shopping'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
const first = (await p.locator('.chips.system .chip-link').allInnerTexts()).map((s) => s.trim().toLowerCase());
const rest = (await p.locator('.chips:not(.system) .chip-link').allInnerTexts()).map((s) => s.trim().toLowerCase());
check('the first line holds only labels the app and the automations use', first.length > 0 && first.every((t) => SYS.includes(t)), first.join());
const uniq = [...new Set(first)]; // (the test server has several labels called week)
check('…in the fixed order', uniq.join() === SYS.filter((t) => first.includes(t)).join() && first.join() === first.slice().sort((a, b) => SYS.indexOf(a) - SYS.indexOf(b)).join(), first.join());
check('none of them is repeated on the other line', !rest.some((t) => SYS.includes(t)), rest.join());
check('the other labels are below, on their own line', rest.length > 0 && (await p.locator('.chips.system').boundingBox()).y < (await p.locator('.chips:not(.system)').boundingBox()).y);
await p.getByPlaceholder('Find a label').fill('ov'); await p.waitForTimeout(400);
const f = (await p.locator('.chips .chip-link').allInnerTexts()).map((s) => s.trim().toLowerCase());
check('the label search still works across both lines', f.length > 0 && f.every((t) => t.includes('ov')), f.join());
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
