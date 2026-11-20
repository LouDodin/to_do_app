const VIEWPORT = { width: 412, height: 915 }; const MOBILE = true;
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
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
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

const out = '/tmp/claude-0/shots';
let p = await newPage(); await p.goto(base + '/'); await p.waitForTimeout(1200);
await p.locator('.fab').tap(); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/m_capture.png` });
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.locator('.search-inner input').first().tap().catch(()=>{}); await p.keyboard.type('re'); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/m_search.png` });
await p.goto(base + '/'); await p.waitForTimeout(900);
await p.click('[aria-label="Toggle filters and labels panel"]'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/m_rightdrawer.png` });
await p.goto(base + '/'); await p.waitForTimeout(900);
await p.locator('[aria-label="Toggle projects panel"]').locator('xpath=following-sibling::*[1]').tap().catch(()=>{}); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/m_viewswitch.png` });
await browser.close();
