// Deleting an ARCHIVED project must not lose its open tasks (4 Nov 2026: "check cyto on Monday"
// was deleted with its archived project), and archiving asks the server for open tasks the device
// has not received yet (5 Nov 2026). TEST Vikunja only.
// Usage: node e2e/archived-delete.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 600)}`); };
const stamp = Date.now().toString(36);
const allTasks = async () => { let out = [], p = 1; for (;;) { const r = await req('GET', `/api/v1/tasks?page=${p}&per_page=50`); if (!Array.isArray(r.body) || !r.body.length) break; out = out.concat(r.body); if (r.body.length < 50) break; p++; } return out; };

// An archived project with an open task, a finished task and an archived sub-project with an open task
const P = (await req('PUT', '/api/v1/projects', { title: `ArchDel ${stamp}` })).body;
const C = (await req('PUT', '/api/v1/projects', { title: `ArchDel child ${stamp}`, parent_project_id: P.id })).body;
const open1 = (await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `open in archived ${stamp}` })).body;
const done1 = (await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `done in archived ${stamp}` })).body;
for (let i = 0; i < 3 && !(await req('GET', `/api/v1/tasks/${done1.id}`)).body?.done; i++) await req('POST', `/api/v1/tasks/${done1.id}`, { ...done1, done: true });
const open2 = (await req('PUT', `/api/v1/projects/${C.id}/tasks`, { title: `open in archived child ${stamp}` })).body;
for (const x of [C, P]) { const cur = (await req('GET', `/api/v1/projects/${x.id}`)).body; await req('POST', `/api/v1/projects/${x.id}`, { ...cur, is_archived: true }); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept());
await p.goto(base + '/'); await p.waitForTimeout(6000);

// 1. Delete the archived project from "Show archived"
await p.getByRole('button', { name: 'archived', exact: true }).click(); await p.waitForTimeout(500);
await p.locator('aside .link', { hasText: `ArchDel ${stamp}` }).first().click({ button: 'right' }); await p.waitForTimeout(500);
await p.locator('.modal').getByRole('button', { name: 'Delete' }).click();
await p.waitForTimeout(30000); // a large account takes longer (10 Nov 2026 data)
const t1 = (await req('GET', `/api/v1/tasks/${open1.id}`)).body;
const t2 = (await req('GET', `/api/v1/tasks/${open2.id}`)).body;
const t3 = (await req('GET', `/api/v1/tasks/${done1.id}`)).body;
const projects = (await req('GET', '/api/v1/projects?is_archived=true&per_page=200')).body;
const inbox = projects.find((x) => /^inbox$/i.test(x.title) && !x.parent_project_id);
const bin = projects.find((x) => /^bin$/i.test(x.title));
check('the open task of the archived project is kept, in the Inbox', t1?.id === open1.id && t1.project_id === inbox?.id, JSON.stringify(t1));
check('and the one of its archived sub-project too', t2?.id === open2.id && t2.project_id === inbox?.id, JSON.stringify(t2));
check('the finished task goes to the Bin', t3?.id === done1.id && t3.project_id === bin?.id, JSON.stringify(t3));
check('the projects are deleted', !projects.some((x) => x.id === P.id || x.id === C.id), JSON.stringify(projects.filter((x) => /ArchDel/.test(x.title))));
check('nothing refused by the server on this device', (await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('failedWrites'); q.onsuccess = () => res(q.result?.value?.length ?? 0); }; }))) === 0);

// 2. Archiving checks the server: an open task created elsewhere, not yet on this device
const Q = (await req('PUT', '/api/v1/projects', { title: `ArchGuard ${stamp}` })).body;
await p.reload(); await p.waitForTimeout(6000);
const late = (await req('PUT', `/api/v1/projects/${Q.id}/tasks`, { title: `added on another device ${stamp}` })).body;
await p.locator('.link', { hasText: `ArchGuard ${stamp}` }).first().click({ button: 'right' }); await p.waitForTimeout(500);
await p.locator('.modal').getByRole('button', { name: 'Archive' }).click(); await p.waitForTimeout(2500);
const q = (await req('GET', `/api/v1/projects/${Q.id}`)).body;
check('archiving is refused while the server has an open task the device has not seen yet', q.is_archived === false && /open task/.test(await p.locator('.toast, [role=status], [role=alert]').allInnerTexts().then((x) => x.join(' '))), JSON.stringify({ archived: q.is_archived }));

// Tidy up the test copy
for (const id of [open1.id, open2.id, late.id]) await req('DELETE', `/api/v1/tasks/${id}`);
await req('DELETE', `/api/v1/tasks/${done1.id}`);
await req('DELETE', `/api/v1/projects/${Q.id}`);
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
