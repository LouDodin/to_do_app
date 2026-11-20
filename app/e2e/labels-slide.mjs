// New task window on a phone (19 Nov 2026, Lou: "impossible to slide in labels"): the labels list
// opens without the keyboard, fits on the screen, and slides with a finger. TEST Vikunja only.
// Usage: node e2e/labels-slide.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { for (let k = 0; k < 6; k++) { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).catch(() => null); if (r && (r.ok || r.status < 500)) return r.json().catch(() => null); await new Promise((x) => setTimeout(x, 400 * (k + 1))); } return null; };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Slide ${st}` });
const made = [];
for (let i = 0; i < 18; i++) made.push(await req('PUT', '/api/v1/labels', { title: `zz-slide-${st}-${String(i).padStart(2, '0')}`, hex_color: '888888' }));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
await c.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await c.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
await p.goto(base + `/project/${P.id}`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'New task in this project' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Labels', exact: true }).click(); await p.waitForTimeout(600);
const pop = p.locator('.labels-pop');
check('the search box is not focused (no keyboard)', !(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find a label')));
const box = await pop.boundingBox();
check('the list fits on the screen', box.y + box.height <= 700, JSON.stringify(box));
const info = await pop.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
check('the list is longer than its box (there is something to slide)', info.sh > info.ch + 20, JSON.stringify(info));
const cdp = await c.newCDPSession(p);
// A finger: touch down near the bottom of the list, move up, lift.
const fx = Math.round(box.x + box.width / 2); let fy = Math.round(box.y + box.height - 30);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy }] });
for (let k = 0; k < 12; k++) { fy -= 15; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx, y: fy }] }); await p.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.waitForTimeout(900);
const top = await pop.evaluate((e) => e.scrollTop);
check('a finger slides the list', top > 50, top);
const last = pop.locator('button.opt').last();
await last.scrollIntoViewIfNeeded(); await last.tap(); await p.waitForTimeout(400);
check('the last label can be tapped and given', (await p.locator('.bar').innerText()).includes('zz-slide') || (await p.locator('.card').innerText()).includes('zz-slide'));
await b.close();
for (const l of made) if (l?.id) await req('DELETE', `/api/v1/labels/${l.id}`);
await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
