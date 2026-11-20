// Phone layout (15 Nov 2026): nothing past the screen's edge on any page at 360 px, the sync dot
// never over the search box, the task's day and time on one line, the new task window's lists
// inside the screen, the Weekly review's Tomorrow as a moon. TEST Vikunja only.
// Usage: node e2e/phone-layout.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { for (let k = 0; k < 6; k++) { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).catch(() => null); if (r && (r.ok || r.status < 500)) return r.json().catch(() => null); await new Promise((x) => setTimeout(x, 400 * (k + 1))); } return null; };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 300)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Phone ${st}` });
const start = new Date(); start.setDate(start.getDate() + 2); start.setHours(9, 0, 0, 0);
const T = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `A task with a rather long title to see how it wraps ${st}`, start_date: start.toISOString() });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
await c.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await c.newPage();
const outside = () => p.evaluate(() => { const vw = document.documentElement.clientWidth; const bad = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (!r.width || !r.height || cs.visibility === 'hidden') continue; if (r.right > vw + 1 || r.left < -1) { let a = el.parentElement, clip = false; while (a) { if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX) && a.getBoundingClientRect().right <= vw + 1) { clip = true; break; } a = a.parentElement; } if (!clip) bad.push(el.tagName + '.' + el.className); } } return bad.slice(0, 4); });
await p.goto(base + '/'); await p.waitForTimeout(6000);
for (const path of ['/', '/inbox', '/shopping', '/upcoming', '/today-review', '/weekly', '/bin', `/project/${P.id}`, `/task/${T.id}`, '/settings']) {
	await p.goto(base + path); await p.waitForTimeout(2500);
	const bad = await outside();
	check(`${path}: nothing past the screen's edge`, bad.length === 0, bad.join(' | '));
}
await p.goto(base + '/'); await p.waitForTimeout(2000);
const s = await p.locator('.search-inner').boundingBox(), d = await p.locator('.sync-slot').boundingBox();
check('top bar: the sync dot is not over the search box', s.x + s.width <= d.x + 1, JSON.stringify({ s, d }));
await p.goto(base + `/task/${T.id}`); await p.waitForTimeout(2500);
const [day, time] = await p.locator('.datefield').first().locator('input').all();
const db = await day.boundingBox(), tb = await time.boundingBox();
check('task: the start day and time on one line', Math.abs(db.y - tb.y) < 4, JSON.stringify({ db, tb }));
check('task: the time is not cut', await time.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
check('task: no emoji on Link a task', !(await p.getByRole('button', { name: /Link a task/ }).innerText()).includes('🔗'));
await p.goto(base + `/project/${P.id}`); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'New task in this project' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Labels', exact: true }).click(); await p.waitForTimeout(500);
const pop = await p.locator('.labels-pop').boundingBox();
check('new task window: the labels list stays inside the screen', pop && pop.x >= 0 && pop.x + pop.width <= 360, JSON.stringify(pop));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await p.waitForTimeout(500); await p.goto(base + '/weekly').catch(() => p.goto(base + '/weekly')); await p.waitForTimeout(3000);
const slot = p.locator('[data-step="plan"] .slot').first();
if (await slot.count()) {
	const [w, m] = await slot.locator('.choose').all();
	const wb = await w.boundingBox(), mb = await m.boundingBox(), tb = await slot.locator('.row').boundingBox();
	check('weekly: the week calendar and the Tomorrow moon, one above the other, at the top of the row', mb.y > wb.y + 10 && Math.abs(mb.x - wb.x) < 2 && wb.y < tb.y + 16, JSON.stringify({ wb, mb, tb }));
}
await b.close();
await req('DELETE', `/api/v1/tasks/${T.id}`); await req('DELETE', `/api/v1/projects/${P.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
