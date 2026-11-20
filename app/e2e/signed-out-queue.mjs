// The week of Oct 2026: a phone kept capturing tasks while the server was unreachable, its
// session expired, the server came back and refused it. Its tasks must survive, be announced on
// the sign-in page, and reach the server after sign-in, with a 30-day session this time.
// Usage: node e2e/signed-out-queue.mjs <appBase> <apiBase> <user> <password>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' });
const login = async () => (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const jwt = await login();
await ctx.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); } }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(5000);
// 1. Server unreachable: capture 3 tasks
await ctx.route(api + '/**', (r) => r.abort('connectionrefused'));
const stamp = Date.now().toString(36);
for (let i = 1; i <= 3; i++) {
	await p.goto(base + '/quick-add'); await p.waitForTimeout(1200);
	await p.keyboard.type(`Captured offline ${stamp} #${i}`); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
}
const queued = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { try { const t = r.result.transaction('queue').objectStore('queue').count(); t.onsuccess = () => res(t.result); } catch (e) { res('err ' + e); } }; r.onerror = () => res('no db'); }));
check('three captures kept on the device while the server is unreachable', queued >= 3, queued);
// 2. Server back, but this session is over (expired token, refresh refused)
await ctx.unroute(api + '/**');
await p.evaluate(() => localStorage.setItem('vikunja_jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.x'));
await ctx.clearCookies();
await p.goto(base + '/'); await p.waitForTimeout(6000);
check('the app asks to sign in again', p.url().includes('/login'), p.url());
const note = (await p.locator('.waiting').textContent().catch(() => '')) ?? '';
check('the sign-in page says the changes are kept', /\d+ changes? made on this device/.test(note), note);
// 3. Sign in: the captures reach the server; the session lasts 30 days
await p.fill('input[autocomplete=username]', user); await p.fill('input[type=password]', pass);
const [resp] = await Promise.all([p.waitForResponse((r) => r.url().endsWith('/api/v1/login')), p.click('button[type=submit]')]);
const body = JSON.parse(resp.request().postData() || '{}');
check('sign-in asks for a long session', body.long_token === true, JSON.stringify(Object.keys(body)));
const sc = (await resp.allHeaders())['set-cookie'] || '';
check('  and the server grants 30 days', /Max-Age=2592000/.test(sc), sc.slice(0, 80));
await p.waitForTimeout(8000);
const fresh = await login();
const found = await (await fetch(api + `/api/v1/tasks?filter=${encodeURIComponent(`title like %${stamp}%`)}&per_page=50`, { headers: { Authorization: 'Bearer ' + fresh } })).json();
check('the three captures reached the server, once each', Array.isArray(found) && found.length === 3, JSON.stringify(found).slice(0, 200));
const left = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const t = r.result.transaction('queue').objectStore('queue').count(); t.onsuccess = () => res(t.result); }; }));
check('nothing left waiting on the device', left === 0, left);
for (const t of found) await fetch(api + `/api/v1/tasks/${t.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + fresh } });
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
