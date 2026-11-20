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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
    if (m === 'PUT' && (r = u.pathname.match(/\/tasks\/(\d+)\/labels$/))) { const t = tasks.find((x) => x.id === +r[1]); const lid = body().label_id; if (t && !t.labels.some((l) => l.id === lid)) t.labels.push(labels.find((x) => x.id === lid) || { id: lid, title: 'x' + lid, hex_color: '000000' }); return json({ label_id: lid }); }
    if (m === 'DELETE' && (r = u.pathname.match(/\/tasks\/(\d+)\/labels\/(\d+)$/))) { const t = tasks.find((x) => x.id === +r[1]); if (t) t.labels = t.labels.filter((l) => l.id !== +r[2]); return json({ message: 'Successfully deleted.' }); }
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

// 1. Home renders its blocks and the six mock tasks without runtime errors
let page = await newPage();
await page.goto(base + '/');
await page.waitForSelector('[role=treeitem]'); await page.waitForSelector('text=Review the contract draft', { timeout: 8000 }).catch(() => {});
check('home: project tree and tasks render', (await page.locator('[role=treeitem]').count()) === 7 && (await page.getByText('Review the contract draft').count()) > 0, (await page.locator('[role=treeitem]').count()) + ' ' + (await page.getByText('Review the contract draft').count()));
check('home: the home icon is always visible', (await page.locator('[aria-label="Go to home page"]').count()) === 1);
check('home: no JavaScript errors', page.errors.length === 0, page.errors.join(' | '));

// 1b2. Label window: Enter picks the label and keeps the window open; Exit closes it
{
  await page.keyboard.press('j'); await page.keyboard.press('l');
  const pop = page.locator('[aria-label="Edit labels"]');
  if (await pop.count()) {
    await page.keyboard.type('urgent'); await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const stillOpen = (await pop.count()) === 1;
    const cleared = (await pop.locator('input[type=text]').inputValue()) === '';
    await page.keyboard.type('waiting'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const secondOpen = (await pop.count()) === 1;
    await pop.getByRole('button', { name: 'Exit' }).click(); await page.waitForTimeout(200);
    check('label window: Enter keeps it open for the next label, Exit closes it', stillOpen && cleared && secondOpen && (await pop.count()) === 0, JSON.stringify({ stillOpen, cleared, secondOpen }));
  } else check('label window: could not open (skipped)', true);
}

// 1b3. Side panels have no minimum width
{
  const rz = page.locator('.resizer').first();
  const bb = await rz.boundingBox();
  if (bb) {
    await page.mouse.move(bb.x + bb.width / 2, bb.y + 200); await page.mouse.down();
    await page.mouse.move(60, bb.y + 200, { steps: 8 }); await page.mouse.up();
    const w = await page.evaluate(() => document.querySelector('aside.side.left')?.getBoundingClientRect().width ?? -1);
    check('side panel can be dragged narrower than the old minimum', w < 150, String(w));
  } else check('side panel resizer not found (skipped)', true);
}

// 1b4. New project window: cursor lands in the name field, and clicking it keeps the window open
{
  await page.getByRole('button', { name: 'New project', exact: true }).first().click();
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('placeholder'));
  await page.locator('[role=dialog][aria-label="New project"] input[placeholder="Project name"]').click();
  await page.waitForTimeout(200);
  const open = await page.locator('[role=dialog][aria-label="New project"]').count();
  check('windows: cursor starts in the first field; clicking the name keeps New project open', focused === 'Project name' && open === 1, JSON.stringify({ focused, open }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
}

// 1b5. Row popovers open under their column, or above it when there is not enough room below
{
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 460 });
  const chips = page.locator('.col-project .chip:visible');
  const n = await chips.count();
  if (n) {
    await chips.nth(n - 1).scrollIntoViewIfNeeded();
    await chips.nth(n - 1).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const a = document.querySelector('.anchor'); if (!a) return null; const b = a.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight }; });
    check('row popover stays inside the window (flips above when needed)', !r || (r.bottom <= r.h + 1 && r.top >= -1), JSON.stringify(r));
    await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
  }
  await page.setViewportSize(vp);
}

// 1b6. The pending / archived switches of the menu stay readable when switched on (10 Nov 2026: small chips)
{
  const btn = page.getByRole('button', { name: 'pending', exact: true });
  check('menu: the "pending" switch is there', (await btn.count()) === 1);
  if (await btn.count()) {
    await btn.click(); await page.waitForTimeout(200);
    const lum = await btn.evaluate((b) => {
      const m = getComputedStyle(b).backgroundColor.match(/\d+/g) || [];
      const alpha = m.length > 3 ? +getComputedStyle(b).backgroundColor.split(',')[3] : 1;
      return { pressed: b.getAttribute('aria-pressed'), rgb: m.slice(0, 3).map(Number), alpha };
    });
    const dark = lum.alpha > 0.5 && Math.max(...lum.rgb) < 90;
    check('pending, once on, is pressed and not a black button', lum.pressed === 'true' && !dark, JSON.stringify(lum));
    await btn.click(); await page.waitForTimeout(150);
  }
}

// 1b7. Every click inside the New project window keeps it open and does what it says
{
  const dlg = page.locator('[role=dialog][aria-label="New project"]');
  const open = async () => { await page.getByRole('button', { name: 'New project', exact: true }).first().click(); await page.waitForTimeout(250); };
  await open();
  const res = {};
  await dlg.locator('.trigger').click(); await page.waitForTimeout(200);
  res.listOpen = (await page.locator('.float').count()) === 1;
  await page.locator('.float button.option', { hasText: 'Client A' }).first().click(); await page.waitForTimeout(250);
  res.afterParent = await dlg.count();
  res.parentShown = (await dlg.locator('.trigger').innerText()).includes('Client A');
  await dlg.locator('input[type=checkbox]').check(); await page.waitForTimeout(100);
  res.afterPending = await dlg.count();
  await dlg.locator('.trigger .clear').click(); await page.waitForTimeout(200);
  res.afterClear = await dlg.count();
  await dlg.locator('.trigger').click(); await page.waitForTimeout(200);
  await dlg.locator('h2').click(); await page.waitForTimeout(200);   // click elsewhere in the window: closes the list only
  res.afterAway = await dlg.count();
  const ctxBtn = dlg.locator('.seg button', { hasText: 'Pro' });
  if (await ctxBtn.count()) { await ctxBtn.click(); await page.waitForTimeout(100); }
  res.afterContext = await dlg.count();
  check('New project window: all clicks keep it open', res.listOpen && res.afterParent === 1 && res.parentShown && res.afterPending === 1 && res.afterClear === 1 && res.afterAway === 1 && res.afterContext === 1, JSON.stringify(res));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  if (await dlg.count()) await page.keyboard.press('Escape');
}

// 1b8. New project opened from a task's project list: choosing its parent keeps it open
{
  const chips = page.locator('.col-project .chip:visible');
  if (await chips.count()) {
    await chips.first().click(); await page.waitForTimeout(250);
    await page.locator('button.option', { hasText: 'New project' }).first().click(); await page.waitForTimeout(250);
    const dlg = page.locator('[role=dialog][aria-label="New project"]');
    await dlg.locator('.trigger').click(); await page.waitForTimeout(200);
    await page.locator('.float button.option', { hasText: 'Client A' }).first().click(); await page.waitForTimeout(300);
    const still = await dlg.count();
    check('New project (from a task): choosing the parent keeps the window open', still === 1, String(still));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
  }
}

// 1b9. Changing view (All / Pro / Perso) goes back to the home page
{
  await page.goto(base + '/bin'); await page.waitForTimeout(400);
  await page.locator('.wrap .trigger').first().click();
  await page.getByRole('option', { name: 'Perso' }).click(); await page.waitForTimeout(400);
  const path = new URL(page.url()).pathname;
  check('changing view returns to the home page', path === '/', path);
  await page.locator('.wrap .trigger').first().click();
  await page.getByRole('option', { name: 'All' }).click(); await page.waitForTimeout(300);
}

// 1b10. A link can choose the view: /?view=perso
{
  const p2 = await newPage();
  await p2.goto(base + '/?view=perso'); await p2.waitForTimeout(800);
  const v = await p2.evaluate(() => localStorage.getItem('view'));
  check('link ?view=perso selects that view', v === 'Perso', String(v));
  await p2.context().close();
}

// 1b11. Home lists of All / Pro / Perso: no Start or Links columns, wider Project column
{
  const p2 = await newPage();
  await p2.goto(base + '/?view=all'); await p2.waitForSelector('.head', { timeout: 8000 }).catch(() => {});
  const r = await p2.evaluate(() => ({ heads: [...document.querySelectorAll('.head')].map((h) => h.textContent), proj: document.querySelector('.head .h-project')?.getBoundingClientRect().width, cells: document.querySelectorAll('.row .col-link').length }));
  check('All view: no Start / Links columns, wide Project column', r.heads.length > 0 && r.heads.every((t) => !/Start|Links/.test(t)) && r.proj > 200 && r.cells === 0, JSON.stringify(r));
  const paths = await p2.evaluate(() => [...document.querySelectorAll('.row .col-project .chip')].map((c) => (c.textContent || '').trim()));
  check('All view: nested projects are written Root/project', paths.some((t) => /^Perso\/Home/.test(t) || /Perso\s*Home/.test(t)), JSON.stringify(paths));
  await p2.goto(base + '/inbox'); await p2.waitForSelector('.head', { timeout: 8000 }).catch(() => {});
  const inb = await p2.evaluate(() => document.querySelector('.head')?.textContent ?? '');
  check('Inbox page keeps the Start and Links columns', /Start/.test(inb) && /Links/.test(inb), inb);
  await p2.context().close();
}

// 1b12. Task details: full path to the project, and a way back to the Inbox
{
  const p2 = await newPage();
  await p2.goto(base + '/task/105'); await p2.waitForSelector('.path', { timeout: 8000 }).catch(() => {});
  const path = await p2.locator('.path').innerText().catch(() => '');
  const full = await p2.locator('.path').getAttribute('title').catch(() => '');
  check('task details show where the project sits (11 Nov 2026: "in Perso", full path on hover)', path === 'in Perso' && full === 'Perso / Health', `${path} | ${full}`);
  const from = calls.length;
  await p2.getByRole('button', { name: '↩ Inbox' }).click(); await p2.waitForTimeout(1500);
  check('task details: Back to Inbox moves the task to the Inbox project', calls.slice(from).some((c) => /\/tasks\/105$/.test(c.path) && c.body.project_id === 1), JSON.stringify(calls.slice(from, from + 3)));
  await p2.context().close();
  tasks.find((t) => t.id === 105).project_id = 22; // put the test data back
}

// 1b13. The stand-alone New task window (/quick-add): same panel, cursor in the first field
{
  const p2 = await newPage();
  await p2.goto(base + '/quick-add'); await p2.waitForTimeout(1200);
  const info = await p2.evaluate(() => ({ tag: document.activeElement?.tagName, sidebar: !!document.querySelector('aside.side'), field: !!document.querySelector('.quick-add input, .quick-add textarea') }));
  check('quick-add window: bare panel with the cursor in the title field', info.field && !info.sidebar && (info.tag === 'INPUT' || info.tag === 'TEXTAREA'), JSON.stringify(info));
  await p2.context().close();
}

// 1b14. New task panel wording; repeating tasks; Tomorrow's priorities rows
{
  const p2 = await newPage();
  await p2.goto(base + '/quick-add'); await p2.waitForTimeout(1200);
  const ph = await p2.evaluate(() => [...document.querySelectorAll('.quick-add input[placeholder], .quick-add textarea')].map((e) => e.getAttribute('placeholder')));
  const txt = await p2.locator('.quick-add').innerText();
  // Since 19 Oct 2026: one box for the title, nothing else (the task is defined later in the Inbox).
  // 6 Nov 2026: plus the 🛒 Shopping tick.
  check('new task panel: one box for the title, the 🛒 tick and an Add button, nothing else', ph.length === 1 && ph[0] === 'New task' && txt.replace(/\s+/g, ' ').trim() === '🛒 Add', JSON.stringify({ ph, txt }));
  await p2.context().close();
}
{
  const p2 = await newPage();
  await p2.goto(base + '/task/104'); await p2.waitForSelector('.repeat-row', { timeout: 8000 });
  const from = calls.length;
  await p2.locator('.repeat-row select').first().selectOption('week'); await p2.waitForTimeout(1200);
  await p2.locator('.repeat-row select').nth(1).selectOption('3'); await p2.waitForTimeout(300);
  await p2.locator('.repeat-row input[type=time]').fill('09:00'); await p2.locator('.repeat-row input[type=time]').dispatchEvent('change'); await p2.waitForTimeout(1500);
  const upd = calls.slice(from).filter((c) => /\/tasks\/104$/.test(c.path));
  const last = upd[upd.length - 1]?.body ?? {};
  const d = new Date(last.due_date);
  check('repeat: "every week on Wednesday at 9" is saved as a weekly repeat on the right day and time', last.repeat_after === 604800 && d.getDay() === 3 && d.getHours() === 9 && d.getTime() > Date.now(), JSON.stringify(last));
  const dueBefore = last.due_date;
  await p2.goto(base + '/project/21'); await p2.waitForSelector('.checkbox', { timeout: 8000 });
  const from2 = calls.length;
  await p2.locator('.row', { hasText: 'Task with many labels' }).first().locator('.checkbox').click(); await p2.waitForTimeout(1500);
  const done = calls.slice(from2).filter((c) => /\/tasks\/104$/.test(c.path));
  const body = done[done.length - 1]?.body ?? {};
  const delta = new Date(body.due_date) - new Date(dueBefore);
  check('repeat: completing a repeating task keeps it open and moves the due date one week on', body.done === false && Math.abs(delta - 7 * 86400000) <= 3600000 + 1, JSON.stringify({ body, delta }));
  await p2.context().close();
  const t = tasks.find((x) => x.id === 104); t.repeat_after = 0; t.repeat_mode = 0; t.due_date = ZERO; t.done = false; // put the test data back
}

// 1c. In the Inbox view the validation circle is at the far right of the row
{
  const box = await page.evaluate(() => {
    const r = document.querySelector('.row .checkbox.right');
    if (!r) return null;
    const row = r.closest('.row').getBoundingClientRect(), c = r.getBoundingClientRect();
    return { fromRight: row.right - c.right, fromLeft: c.left - row.left };
  });
  check('inbox: the circle is at the far right (when the Inbox view has tasks)', box === null || box.fromRight < 40 && box.fromLeft > 200, JSON.stringify(box));
}

// 1a. Tasks no longer have a context of their own
for (let i = 0; i < 20 && !calls.some((c) => c.m === 'DELETE' && /labels\/8$/.test(c.path)); i++) await page.waitForTimeout(250);
check('tasks: the old per-task context label is removed from the server', calls.some((c) => c.m === 'DELETE' && /labels\/8$/.test(c.path)), JSON.stringify(calls.slice(0, 4)));
check('tasks: no context column or button anywhere in the task list', (await page.locator('[aria-label="Change context"]').count()) === 0 && (await page.locator('.h-type').count()) === 0 && (await page.getByText('Context', { exact: true }).count()) === 0);

// 1b. In All, Perso projects are listed before Pro ones
{
  const names = await page.$$eval('[role=treeitem]', (els) => els.filter((e) => !e.style.paddingLeft || e.style.paddingLeft === '0px' || e.style.paddingLeft === '6px').map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  const pi = names.findIndex((n) => /Perso$/.test(n)), pr = names.findIndex((n) => /Pro$/.test(n));
  check('projects: Perso is listed before Pro in All', pi >= 0 && pr >= 0 && pi < pr, names.join(' | '));
}

// 2. Project drag and drop: nest, reorder, and refuse a drop into its own sub-tree
const item = (t) => page.locator('[role=treeitem]', { hasText: t }).first();
const order = () => page.$$eval('[role=treeitem]', (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' ') + '@' + e.style.paddingLeft));
await item('Admin').dragTo(item('Home'));
await page.waitForTimeout(400);
check('projects: dropping inside nests (Admin under Home)', (await order()).some((x) => x.startsWith('Admin@28px')));
check('projects: the new parent is sent to the server', calls.some((c) => c.path === '/api/v1/projects/13' && c.body.parent_project_id === 21));
for (let i = 0; i < 16 && !calls.some((c) => c.path === '/api/v1/projects/13' && String(c.body.description).includes('[ctx:perso]')); i++) await page.waitForTimeout(250);
check('projects: dragging from Pro to Perso changes its context', calls.some((c) => c.path === '/api/v1/projects/13' && typeof c.body.description === 'string' && c.body.description.includes('[ctx:perso]')), JSON.stringify(calls.filter((c) => c.path === '/api/v1/projects/13').map((c) => c.body)));
const before = (await order()).join();
await item('Perso').dragTo(item('Admin'));
await page.waitForTimeout(300);
check('projects: a drop into its own sub-tree is refused', (await order()).join() === before);

// 3. Filters: whole row draggable, click still navigates
const fn = () => page.$$eval('[data-fid]', (els) => els.map((e) => e.textContent.replace('⠿', '').trim()));
const a = await page.locator('[data-fid]').nth(1).boundingBox(); const b = await page.locator('[data-fid]').nth(0).boundingBox();
await page.mouse.move(a.x + 40, a.y + a.height / 2); await page.mouse.down();
await page.mouse.move(a.x + 40, a.y + a.height / 2 - 10, { steps: 4 }); await page.mouse.move(b.x + 40, b.y + 2, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(200);
check('filters: dragging a row reorders them', (await fn()).join() === 'Red,Available', (await fn()).join());
// a new filter goes to the bottom, not into alphabetical place
await page.getByRole('button', { name: 'New filter' }).click();
await page.locator('[role=dialog] input[type=text]').first().fill('Aardvark');
await page.locator('[role=dialog] textarea').fill('done = false');
await page.getByRole('button', { name: 'Create' }).click();
await page.waitForTimeout(800);
check('filters: a new filter goes to the bottom of the list', (await fn()).join() === 'Red,Available,Aardvark', (await fn()).join());
await page.locator('[data-fid]').nth(0).click(); await page.waitForTimeout(300);
check('filters: a plain click opens the filter', page.url().includes('/filter/'));

// 4. Label editor: one dialog, attached to <body>
await page.goto(base + '/'); await page.waitForSelector('[data-fid]');
await page.locator('[aria-label*="pharmacy label"]').first().click({ button: 'right' });
await page.waitForTimeout(300);
check('label editor: exactly one dialog, outside the page layout', (await page.locator('[role=dialog][aria-label="Edit label"]').count()) === 1 && (await page.$eval('.backdrop', (e) => e.parentElement.tagName)) === 'BODY');
await page.keyboard.press('Escape');

// 5. New project: parent list opens outside the window and picking works
await page.locator('[aria-label="New project"]').click();
await page.getByText('None (top level)').click(); await page.waitForTimeout(300);
check('new project: the parent list floats above the window (not clipped by it)', (await page.$eval('.float', (e) => e.parentElement.tagName)) === 'BODY' && (await page.locator('.float button', { hasText: 'Client A' }).count()) === 1);
await page.getByRole('button', { name: 'Client A' }).click();
check('new project: picking a parent works', (await page.locator('[role=dialog] .trigger').first().textContent()).includes('Client A'));
check('new project: a Context choice (Pro / Perso / None) is offered', (await page.locator('[role=dialog] [aria-label=Context] button').count()) === 3);
await page.keyboard.press('Escape'); await page.waitForTimeout(300); // closing a window steps back in the history

// 6. Task rows: every label shown in the list (no hidden ones for a task with six labels)
await page.goto(base + '/'); await page.waitForSelector('[role=treeitem]');
const row = page.locator('.row', { hasText: 'Task with many labels' }).first();
check('task rows: labels of a task with six labels are all in the row', (await row.locator('.label-remove').count()) === 6);

// 7. Duplicating a task keeps every label
await page.goto(base + '/task/104'); await page.waitForTimeout(600);
const dup = page.getByRole('button', { name: /duplicate/i }).first();
if (await dup.count()) {
  await dup.click(); await page.waitForTimeout(2500);
  const create = calls.find((c) => c.m === 'PUT' && /projects\/21\/tasks/.test(c.path));
  const bulk = calls.filter((c) => /tasks\/9\d\d\/labels/.test(c.path));
  check('duplicate: created with the same project and a _2 title', !!create && /_2$/.test(create.body.title) && create.body.project_id === 21, JSON.stringify(create));
  check('duplicate: all six labels sent for the copy', bulk.length >= 1, `${bulk.length} label requests`);
  check('duplicate: the copy opens (no "Task not found")', !/task\/-/.test(page.url()));
} else check('duplicate: button found', false, 'no duplicate button');

// 7b. A task given a project stays in the Inbox view until it is validated
await page.context().close();
page = await newPage();
await page.goto(base + '/task/107'); await page.waitForSelector('.trigger');
await page.locator('.field', { hasText: 'Project' }).locator('.trigger').first().click();
await page.locator('.float button', { hasText: 'Client A' }).click();
for (let i = 0; i < 20 && tasks.find((t) => t.id === 107).project_id !== 11; i++) await page.waitForTimeout(300);
await page.waitForTimeout(1500);
// Since 19 Oct 2026: still to validate = no "validated" mark (and, before the one-time marking, the old flag).
const t107 = tasks.find((t) => t.id === 107);
check('inbox: a task given a project is still to validate', t107.project_id === 11 && !t107.labels.some((l) => l.title === 'ctx:validated') && (t107.labels.some((l) => l.title === 'ctx:review') || calls.some((c) => c.path === '/api/v1/user/settings/general')), JSON.stringify(t107));

check('inbox: a due date set before choosing the project is kept', tasks.find((t) => t.id === 107).due_date === day(3), String(tasks.find((t) => t.id === 107).due_date));

// 8. Fresh start (clean page, so nothing queued by the steps above interferes)
await page.context().close();
page = await newPage();
calls.length = 0;
page.on('dialog', (d) => d.accept());
await page.goto(base + '/settings'); await page.locator('details.tools summary').click(); await page.waitForSelector('text=Fresh start');
// wait for the first sync of this fresh device (Fresh start refuses to run before it)
for (let i = 0; i < 30 && !(await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('lastPull'); q.onsuccess = () => res(!!q.result); q.onerror = () => res(false); }; r.onerror = () => res(false); }))); i++) await page.waitForTimeout(300);
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.getByRole('button', { name: 'Fresh start' }).click()]);
for (let i = 0; i < 24 && !(calls.some((c) => c.m === 'DELETE' && /labels\/\d+$/.test(c.path)) && calls.some((c) => c.path === '/api/v1/tasks/103')); i++) await page.waitForTimeout(500);
check('fresh start: a backup file is downloaded', !!download && /^tasks-backup-/.test(download.suggestedFilename()));
check('fresh start: the completed task is reopened', calls.some((c) => c.path === '/api/v1/tasks/103' && c.body.done === false), JSON.stringify(calls.slice(0, 5)));
check('fresh start: duplicate label merged (extra "quick-win" deleted)', calls.some((c) => c.m === 'DELETE' && /labels\/7$/.test(c.path)) || calls.some((c) => c.m === 'DELETE' && /labels\/5$/.test(c.path)));
check('fresh start: tasks get the review label', calls.some((c) => /\/tasks\/\d+\/labels/.test(c.path)));

// 9. Deleting a project: open tasks go to the Inbox, completed ones are removed
tasks.find((t) => t.id === 106).done = true; // (the fresh start above reopened it)
await page.context().close();
page = await newPage();
calls.length = 0;
page.on('dialog', (d) => d.accept());
await page.goto(base + '/'); await page.waitForSelector('[role=treeitem]');
await page.locator('[role=treeitem]', { hasText: 'Health' }).first().click({ button: 'right' });
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(() => true); for (let i = 0; i < 30 && !calls.some((c) => c.m === 'DELETE' && /projects\/22$/.test(c.path)); i++) await page.waitForTimeout(500);
check('delete project: the open task moves to the Inbox project', calls.some((c) => c.path === '/api/v1/tasks/105' && c.body.project_id === 1), JSON.stringify(calls.slice(0, 6)));
check('delete project: the open task is in the Inbox project and needs no context label', tasks.find((t) => t.id === 105).project_id === 1 && !tasks.find((t) => t.id === 105).labels.some((l) => /^ctx:(pro|perso)$/.test(l.title)));
const binP = projects.find((p) => p.title === 'Bin');
check('delete project: the completed task goes to the Bin, not deleted', !!binP && calls.some((c) => c.path === '/api/v1/tasks/106' && c.m === 'POST' && c.body.project_id === binP.id) && !calls.some((c) => c.m === 'DELETE' && /tasks\/106$/.test(c.path)));
check('delete project: the project itself is deleted', calls.some((c) => c.m === 'DELETE' && /projects\/22$/.test(c.path)));
check('delete project: the open task is never deleted', !calls.some((c) => c.m === 'DELETE' && /tasks\/105$/.test(c.path)));

// 9b. The Bin lists it and restoring sends it back to the Inbox
await page.goto(base + '/bin'); await page.waitForSelector('text=Old finished task');
check('bin: the deleted task is listed with days left', (await page.getByText('days left').count()) >= 1);
calls.length = 0;
await page.getByRole('button', { name: 'Restore' }).first().click();
await page.waitForTimeout(1500);
check('bin: restore puts it back in the Inbox, open', calls.some((c) => /tasks\/10[0-9]$/.test(c.path) && c.body.project_id === 1 && c.body.done === false), JSON.stringify(calls.slice(0, 4)));
check('bin: the project list never shows the Bin', (await page.locator('[role=treeitem]', { hasText: 'Bin' }).count()) === 0);
await page.goto(base + '/'); await page.waitForSelector('[role=treeitem]');

// 9c. No Save button: closing the project window keeps the edit
await page.locator('[role=treeitem]', { hasText: 'Admin' }).first().click({ button: 'right' });
check('edit project: there is no Save button', (await page.getByRole('button', { name: 'Save' }).count()) === 0);
await page.locator('[role=dialog] input[type=text]').first().fill('Admin office');
await page.getByRole('button', { name: 'Close' }).click();
await page.waitForTimeout(800);
check('edit project: closing the window applies the new name', calls.some((c) => /projects\/13$/.test(c.path) && c.body.title === 'Admin office'));

// 9d. A new project goes to the bottom of its context, and nothing reorders by itself
await page.getByRole('button', { name: 'New project' }).click();
await page.locator('[role=dialog] input[type=text]').first().fill('Zeta');
await page.locator('[role=dialog] [aria-label=Context] button', { hasText: 'Perso' }).click();
await page.getByRole('button', { name: 'Create' }).click();
await page.waitForTimeout(1500);
{
  const roots = await page.$$eval('[role=treeitem]', (els) => els.filter((e) => !e.style.paddingLeft || e.style.paddingLeft === '0px' || e.style.paddingLeft === '6px').map((e) => e.textContent.trim().replace(/\s+/g, ' ').replace('▾ ', '')));
  check('new project: it goes to the bottom of its context (Perso), above Pro', roots.indexOf('Zeta') > roots.indexOf('Perso') && roots.indexOf('Zeta') < roots.indexOf('Pro'), roots.join(' | '));
}
const zpos = calls.find((c) => c.m === 'POST' && /projects\/\d+$/.test(c.path) && typeof c.body.position === 'number' && c.body.title === 'Zeta');
check('new project: its position is sent after the others', !!zpos && zpos.body.position >= 1, JSON.stringify(calls.filter((c) => /projects/.test(c.path)).slice(-3)));

// 10. Archiving: refused while tasks are open, allowed when finished
await page.locator('[role=treeitem]', { hasText: 'Client B' }).first().click({ button: 'right' });
await page.getByRole('button', { name: 'Archive', exact: true }).click();
await page.waitForTimeout(800);
check('archive: the project leaves the tree', (await page.locator('[role=treeitem]', { hasText: 'Client B' }).count()) === 0);
check('archive: the server is told', calls.some((c) => /projects\/12$/.test(c.path) && c.body.is_archived === true));
await page.locator('[role=treeitem]', { hasText: 'Client A' }).first().click({ button: 'right' });
await page.getByRole('button', { name: 'Archive', exact: true }).click();
await page.waitForTimeout(800);
check('archive: refused while it has open tasks', !calls.some((c) => /projects\/11$/.test(c.path) && c.body.is_archived === true));

// A date set by hand survives updates that only change something else (e.g. the project)
{
  const t101 = tasks.find((x) => x.id === 101);
  const touched = calls.some((c) => c.m === 'POST' && /\/tasks\/101$/.test(c.path));
  check('dates set by hand are kept when only the project changes', !touched || (t101 && t101.due_date !== ZERO), JSON.stringify({ touched, due: t101?.due_date }));
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
