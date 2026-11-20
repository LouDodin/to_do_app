// The Inbox keeps a task on screen until you validate, complete or bin it, even if the device
// wrongly thinks it should leave (21 Oct 2026 report), and writes a "trace" to the error report.
// Usage: node e2e/sticky.mjs <app> <vikunja>   (a copy of the real data; resets nothing)
import { chromium } from 'playwright-core';
const [base, api] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'LouDodin', password: 'local-test-only-123' }) })).json()).token;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
await c.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); } }, [api, jwt]);
const p = await c.newPage();
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : '→ ' + got); };
await p.goto(base + '/inbox'); await p.waitForTimeout(9000);
const rows = p.locator('.row:has(.checkbox)');
const titles = await rows.locator('.title').allTextContents();
check('inbox has tasks', titles.length >= 3);
const a = titles[0].trim();
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1); // titles start with a capital (6 Nov 2026)
// Simulate the bug: the device's copy of task A gets the validated mark behind the app's back.
await p.evaluate((t) => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const tx = r.result.transaction('tasks', 'readwrite'); const st = tx.objectStore('tasks'); const g = st.getAll(); g.onsuccess = () => { const x = g.result.find((y) => y.title === t); x.labels = [...(x.labels || []), { id: 999999, title: 'ctx:validated', hex_color: '4caf50' }]; st.put(x); }; tx.oncomplete = () => res(); }; }), a);
// Any change through the app makes the lists read the database again: rename task A.
await rows.filter({ hasText: a }).locator('.title').first().click(); await p.waitForTimeout(400);
await p.locator('.row textarea').first().fill(a + ' x'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
check('task still in the Inbox after the change', (await rows.filter({ hasText: cap(a) + ' x' }).count()) === 1);
await p.waitForTimeout(2500); // the update has reached the server and its reply is stored
check('and keeps its place (top, newest first)', ((await rows.locator('.title').first().textContent()) || '').trim() === cap(a) + ' x', (await rows.locator('.title').first().textContent()));
const trace = await p.evaluate(() => JSON.parse(localStorage.getItem('tasks_error_recent') || '[]').filter((e) => e.kind === 'trace'));
check('trace written once', trace.length === 1 && /would have left the Inbox/.test(trace[0].message));
console.log('  ', trace[0]?.message);
// Validate task A with the circle (it has a project): now it leaves.
await rows.filter({ hasText: cap(a) + ' x' }).locator('.checkbox').first().click(); await p.waitForTimeout(2500);
check('validated task leaves the Inbox', (await rows.filter({ hasText: cap(a) + ' x' }).count()) === 0);
console.log(`${ok}/${n} passed`);
await b.close();
process.exit(ok === n ? 0 : 1);
