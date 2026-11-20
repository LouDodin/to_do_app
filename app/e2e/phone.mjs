const VIEWPORT = { width: 412, height: 915 }; const MOBILE = true; globalThis.MOCK = { fail401: false };
// End-to-end smoke test against a mock Vikunja (no real server or data is touched).
// Usage:  npm run build && npx vite preview --port 4300 &  node e2e/smoke.mjs [baseUrl]
// Needs playwright-core and a Chromium (set CHROMIUM=/path if not at /opt/pw-browsers/chromium).
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:4300';
const ZERO = '0001-01-01T00:00:00Z';
const now = new Date();
const day = (n) => { const x = new Date(now); x.setDate(x.getDate() + n); x.setHours(23, 59, 0, 0); return x.toISOString(); };

const labels = [
  { id: 1, title: 'today', hex_color: '1c1c1f' }, { id: 2, title: 'next-action', hex_color: '3b82f6' },
  { id: 3, title: 'urgent', hex_color: 'ef4444' }, { id: 4, title: 'waiting', hex_color: 'f59e0b' },
  { id: 5, title: 'quick-win', hex_color: '22c55e' }, { id: 6, title: 'pharmacy', hex_color: 'a855f7' },
  { id: 7, title: 'quick-win', hex_color: '22c55e' }, // duplicate on purpose
  { id: 8, title: 'ctx:perso', hex_color: '6abe8e' } // old per-task context label: the app removes it
];
const P = (id, title, parent = 0, extra = {}) => ({ id, title, parent_project_id: parent, ...extra });
const projects = [P(1, 'Inbox'), P(10, 'Pro'), P(11, 'Client A', 10), P(12, 'Client B', 10), P(13, 'Admin', 10, { description: '[ctx:pro]\n' }),
  P(20, 'Perso'), P(21, 'Home', 20), P(22, 'Health', 20), P(-1, 'Red'), P(-2, 'Available')];
const T = (id, title, project_id, o = {}) => ({ id, title, project_id, done: false, due_date: ZERO, start_date: ZERO, priority: 0, labels: [], ...o });
const tasks = [
  T(101, 'Send the quarterly report to the client', 11, { due_date: day(0), labels: [labels[0], labels[2]] }),
  T(102, 'Review the contract draft', 11, { labels: [labels[1]] }),
  T(103, 'Book the dentist', 22, { done: true }),
  T(104, 'Task with many labels', 21, { labels: labels.slice(0, 6) }),
  T(105, 'Call the doctor', 22),
  T(106, 'Old finished task', 22, { done: true }),
  T(107, 'Unfiled note', 1, { due_date: day(3) })
];
const filtersList = [{ id: 1, title: 'Red', filters: { filter: 'labels in 3' } }, { id: 2, title: 'Available', filters: { filter: 'labels in 2' } }];

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const calls = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: MOBILE, hasTouch: MOBILE, deviceScaleFactor: MOBILE ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('vikunja_api_url', 'http://localhost:3456'); localStorage.setItem('vikunja_jwt', 'x'); });
  await page.route('http://localhost:3456/**', (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const body = () => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } };
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (globalThis.MOCK.fail401 && m !== "OPTIONS" && m !== "GET") return route.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{\"message\":\"missing, malformed, expired or otherwise invalid token provided\"}" });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (m !== 'GET') calls.push({ m, path: u.pathname, body: body() });
    let r;
    if (m === 'PUT' && /\/projects\/\d+\/tasks$/.test(u.pathname)) return setTimeout(() => json({ id: 900 + calls.length, done: false, labels: [], ...body() }), 200);
    if (m === 'PUT' && u.pathname === '/api/v1/projects') { const pr = { id: 700 + projects.length, ...body() }; projects.push(pr); return json(pr); }
    if (m === 'PUT' && u.pathname === '/api/v1/filters') { const f = { id: 50 + filtersList.length, ...body() }; filtersList.push(f); return json(f); }
    if (m === 'PUT' && u.pathname === '/api/v1/labels') { const l = { id: 500 + calls.length, ...body() }; labels.push(l); return json(l); }
    if (m === 'POST' && (r = u.pathname.match(/\/tasks\/(\d+)\/labels\/bulk$/))) { const t = tasks.find((x) => x.id === +r[1]); if (t) t.labels = (body().labels || []).map((l) => labels.find((x) => x.id === l.id) || { id: l.id, title: 'x' + l.id, hex_color: '000000' }); return json(body()); }
    if (m === 'POST' && /\/tasks\/\d+$/.test(u.pathname)) { const t = tasks.find((x) => '/api/v1/tasks/' + x.id === u.pathname); if (t) { const b = body(); for (const k of ['due_date', 'start_date', 'end_date']) if (!(k in b)) t[k] = ZERO; /* like Vikunja: omitted dates are cleared */ Object.assign(t, b); } return json({ ...(t || {}), ...body(), labels: null }); } // like the real server: the reply carries no labels
    if (m === 'DELETE' && /\/tasks\/\d+$/.test(u.pathname)) { const i = tasks.findIndex((x) => '/api/v1/tasks/' + x.id === u.pathname); if (i >= 0) tasks.splice(i, 1); return json({}); }
    if (m === 'DELETE' && /\/projects\/\d+$/.test(u.pathname)) { const i = projects.findIndex((x) => '/api/v1/projects/' + x.id === u.pathname); if (i >= 0) projects.splice(i, 1); return json({}); }
    if (m === 'POST' && /\/projects\/\d+$/.test(u.pathname)) { const pr = projects.find((x) => '/api/v1/projects/' + x.id === u.pathname); if (pr) Object.assign(pr, body()); return json({ ...(pr || {}), ...body() }); }
    if (m === 'POST' || m === 'PUT' || m === 'DELETE') return json(body());
    if (u.pathname === '/api/v1/projects') return json(projects);
    if (u.pathname === '/api/v1/labels') return json(labels);
    if (u.pathname === '/api/v1/tasks') return json(!u.searchParams.get('page') || u.searchParams.get('page') === '1' ? tasks : []);
    if ((r = u.pathname.match(/^\/api\/v1\/tasks\/(\d+)$/))) return json(tasks.find((t) => t.id === +r[1]) || {});
    if (u.pathname === '/api/v1/filters') return json(filtersList);
    return json({});
  });
  page.errors = errors;
  return page;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Phone shell
let page = await newPage();
await page.goto(base + '/');
await page.waitForSelector('text=Review the contract draft');
check('phone: floating new-task button shown', await page.locator('.fab').isVisible());
check('phone: top-bar "+" hidden', !(await page.locator('.topbar [aria-label="New task"]').isVisible()));
check('phone: no horizontal scrolling', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check('phone: task title not cut (one row, full text)', await page.evaluate(() => { const el = [...document.querySelectorAll('.title')].find((e) => e.textContent.includes('quarterly')); return el && el.scrollWidth <= el.clientWidth + 1; }));

// 2. Tapping a label opens the task; it never removes the label
const before = calls.length;
await page.locator('.row', { hasText: 'Send the quarterly report' }).locator('.label-remove').first().tap();
await page.waitForURL(/\/task\/101/);
check('phone: tapping a label opens the task', page.url().includes('/task/101'));
// (other label writes, e.g. the background upkeep of the old flag, are not about this tap)
check('phone: tapping a label does not remove it', !calls.slice(before).some((c) => (c.m === 'DELETE' && /tasks\/101\/labels/.test(c.path)) || /labels\/bulk/.test(c.path)));

// 3. Relation picker: suggestions, never itself
await page.getByRole('button', { name: '🔗 Link a task' }).click(); // 11 Nov 2026: the link box opens on demand
await page.fill('input[placeholder="Search a task to link…"]', 'r');
await wait(400);
const sugg = await page.locator('.rel-matches button').allTextContents();
check('relations: suggestions listed', sugg.length > 0, JSON.stringify(sugg));
check('relations: the task itself is not suggested', !sugg.some((t) => t.includes('quarterly report')));
check('relations: completed tasks are not suggested', !sugg.some((t) => t.includes('Book the dentist')));
await page.fill('input[placeholder="Search a task to link…"]', 'contract');
await wait(400);
await page.locator('.rel-matches button', { hasText: 'Review the contract draft' }).tap();
await wait(800);
check('relations: picking a suggestion links that task', calls.some((c) => /\/tasks\/101\/relations/.test(c.path) && c.body.other_task_id === 102), JSON.stringify(calls.slice(-3)));

// 4. Back on the list: a task deleted on another device disappears
await page.goto(base + '/');
// (since 25 Oct the home page lists only Today, Red, Available: find it with the filter box)
await page.getByRole('textbox', { name: 'Filter tasks' }).fill('doctor');
await page.waitForSelector('text=Call the doctor');
const idx = tasks.findIndex((t) => t.id === 105); tasks.splice(idx, 1);
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await wait(1500);
check('sync: a task deleted elsewhere disappears here', (await page.getByText('Call the doctor').count()) === 0);

// 5. Signed-out while sending: the change is kept, not dropped
globalThis.MOCK.fail401 = true;
await page.locator('.fab').tap();
await page.waitForSelector('.quick-add input, input[placeholder="New task"]');
await page.locator('input[placeholder="New task"]').first().fill('Kept while signed out');
await page.keyboard.press('Enter');
await wait(1500);
const queued = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const tx = r.result.transaction('queue'); const q = tx.objectStore('queue').getAll(); q.onsuccess = () => res(q.result.map((x) => x.payload && x.payload.title)); }; }));
check('sync: a change refused with 401 stays queued', queued.includes('Kept while signed out'), JSON.stringify(queued));
globalThis.MOCK.fail401 = false;
await page.context().close();

// 6. Installable + offline
const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
const p2 = await ctx.newPage();
await p2.addInitScript(() => { localStorage.setItem('vikunja_api_url', 'http://localhost:3456'); localStorage.setItem('vikunja_jwt', 'x'); });
await p2.route('http://localhost:3456/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: route.request().url().includes('/projects') ? JSON.stringify(projects) : route.request().url().includes('/tasks') && !route.request().url().includes('page=2') ? JSON.stringify(tasks) : '[]' }));
await p2.goto(base + '/');
await p2.waitForSelector('text=Review the contract draft');
const manifestHref = await p2.getAttribute('link[rel=manifest]', 'href');
check('pwa: manifest linked', manifestHref === '/manifest.webmanifest');
const man = await (await p2.request.get(base + '/manifest.webmanifest')).json();
check('pwa: manifest has a New task shortcut and a share target', man.shortcuts?.[0]?.url === '/quick-add' && man.share_target?.action === '/quick-add');
const swOk = await p2.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]));
check('pwa: service worker installed', swOk);
const controlled = await p2.evaluate(() => navigator.serviceWorker.controller ? true : new Promise((r) => { navigator.serviceWorker.addEventListener('controllerchange', () => r(true)); setTimeout(() => r(false), 8000); }));
check('pwa: the service worker controls the page', controlled);
await wait(1500);
await ctx.setOffline(true);
await p2.goto(base + '/').catch((e) => console.log('offline goto:', e.message.split('\n')[0]));
await wait(2000);
check('offline: app opens with no network and shows the tasks', (await p2.getByText('Review the contract draft').count()) > 0);
await ctx.setOffline(false);

// 7. Share target: shared text becomes the new task title
await p2.goto(base + '/quick-add?title=&text=' + encodeURIComponent('Read this article https://example.com/a'));
await wait(1000);
const val = await p2.locator('input[placeholder="New task"]').first().inputValue().catch(() => '');
check('share: shared text prefilled as the task', val === 'Read this article', val);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
