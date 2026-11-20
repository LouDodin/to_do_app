// Real Vikunja (LOCAL test copy of the data, never the PC): the app's writes must land on the
// server exactly as intended. Usage: node e2e/real-flows.mjs <appBase> <apiBase> <jwt>
import { chromium } from 'playwright-core';
const [base, api, jwt] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const get = async (p) => (await fetch(api + p, { headers: { Authorization: `Bearer ${jwt}` } })).json();
const findTask = async (title) => { for (let pg = 1; pg < 10; pg++) { const b = await get(`/api/v1/tasks?page=${pg}&per_page=50&s=${encodeURIComponent(title)}`); if (!b.length) return null; const t = b.find((x) => x.title === title); if (t) return t; } return null; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
await page.goto(base + '/'); await page.waitForTimeout(6000);
const stamp = Date.now().toString(36);

// 1. Create from the new-task window, with a due date by quick-add syntax
const title1 = `E2E pay rent ${stamp}`;
await page.keyboard.press('n'); await page.waitForTimeout(400);
await page.locator('input[placeholder="Task"]').first().fill(`${title1} !in 3 days`);
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
let t1 = await findTask(title1);
check('create: the task reaches the server', !!t1, title1);
const inbox = (await get('/api/v1/projects?is_archived=true')).find((p) => p.title.toLowerCase() === 'inbox');
check('create: it is in the Inbox project', t1?.project_id === inbox?.id, `${t1?.project_id} vs ${inbox?.id}`);
const dd = t1 && Math.round((new Date(t1.due_date) - new Date(new Date().toDateString())) / 86400000);
check('create: "!in 3 days" became the due date', dd === 3 || dd === 4, String(t1?.due_date));

// 2. Task page: move to a project; the due date must survive (Vikunja clears omitted fields)
await page.goto(`${base}/task/${t1.id}`); await page.waitForTimeout(2000);
const projects = (await get('/api/v1/projects?is_archived=true')).filter((p) => p.id > 0 && p.title !== 'INBOX' && p.title !== 'Bin' && !p.is_archived);
const target = projects.find((p) => p.parent_project_id > 0) || projects[0];
await page.getByRole('button', { name: /Inbox|INBOX|Choose|Project/ }).first().click().catch(() => {});
await page.waitForTimeout(400);
const opt = page.locator('.float button, [role=listbox] button, .picker button', { hasText: target.title }).first();
if (await opt.count()) { await opt.click(); await page.waitForTimeout(2500); }
t1 = await get(`/api/v1/tasks/${t1.id}`);
check('move: the task is in the chosen project', t1.project_id === target.id, `${t1.project_id} vs ${target.id} (${target.title})`);
check('move: the due date is kept', t1.due_date && !t1.due_date.startsWith('0001'), t1.due_date);

// 3. Complete it from the task page (x)
await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
await page.keyboard.press('x'); await page.waitForTimeout(2500);
t1 = await get(`/api/v1/tasks/${t1.id}`);
check('complete: done on the server', t1.done === true, JSON.stringify({ done: t1.done }));

// 4. Delete: goes to the Bin project, restore puts it back open in the Inbox
const title2 = `E2E delete me ${stamp}`;
await page.goto(base + '/'); await page.waitForTimeout(1500);
await page.keyboard.press('n'); await page.waitForTimeout(400);
await page.locator('input[placeholder="Task"]').first().fill(title2); await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
let t2 = await findTask(title2);
await page.goto(`${base}/task/${t2.id}`); await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.waitForTimeout(2500);
t2 = await get(`/api/v1/tasks/${t2.id}`);
const bin = (await get('/api/v1/projects?is_archived=true')).find((p) => /^bin$/i.test(p.title));
check('delete: moved to the Bin project (not destroyed)', t2.project_id === bin?.id, `${t2.project_id} vs ${bin?.id}`);
await page.goto(base + '/bin'); await page.waitForTimeout(1500);
await page.locator('li, .row, tr', { hasText: title2 }).getByRole('button', { name: 'Restore' }).click(); await page.waitForTimeout(2500);
t2 = await get(`/api/v1/tasks/${t2.id}`);
check('restore: back in the Inbox, open', t2.project_id === inbox?.id && !t2.done, JSON.stringify({ p: t2.project_id, done: t2.done }));

// 5. Repeat every week: completing moves the due date one week on and keeps it open
await page.goto(`${base}/task/${t2.id}`); await page.waitForTimeout(1500);
await page.locator('select').first().selectOption('week'); await page.waitForTimeout(2500);
let t2b = await get(`/api/v1/tasks/${t2.id}`);
check('repeat: weekly repeat saved', t2b.repeat_after === 604800, String(t2b.repeat_after));
const due0 = new Date(t2b.due_date);
await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
await page.keyboard.press('x'); await page.waitForTimeout(3000);
t2b = await get(`/api/v1/tasks/${t2.id}`);
const shift = Math.round((new Date(t2b.due_date) - due0) / 86400000);
check('repeat: completing moves it one week on and keeps it open', !t2b.done && shift === 7, JSON.stringify({ done: t2b.done, shift, due: t2b.due_date }));

// 6. Offline creation, then back online: sent once, no duplicate
const title3 = `E2E offline ${stamp}`;
await page.goto(base + '/'); await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.keyboard.press('n'); await page.waitForTimeout(400);
await page.locator('input[placeholder="Task"]').first().fill(title3); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
const localTitles = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result.map((t) => t.title)); }; }));
check('offline: saved at once on the device (Inbox)', localTitles.includes(title3));
await ctx.setOffline(false); await page.waitForTimeout(500);
await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(4000);
const all = await get(`/api/v1/tasks?per_page=50&s=${encodeURIComponent(title3)}`);
check('offline: sent once when back online', all.filter((t) => t.title === title3).length === 1, String(all.length));

check('no JavaScript errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
