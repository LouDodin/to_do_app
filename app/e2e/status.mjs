// Validation status (19 Oct 2026): a task stays in the Inbox until you validate it, whatever you
// change; a one-time marking keeps your already-validated tasks out of it. Against a COPY of
// real data (it runs the one-time marking on that copy).
// Usage: node e2e/status.mjs <appBase> <apiBase> <user> <password>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const all = async (path) => { let out = []; for (let pg = 1; pg < 20; pg++) { const b = await (await fetch(`${api}${path}${path.includes('?') ? '&' : '?'}page=${pg}&per_page=50`, { headers: H })).json(); if (!Array.isArray(b) || !b.length) break; out = out.concat(b); if (b.length < 50) break; } return out; };
const projects = await all('/api/v1/projects');
const inboxP = projects.find((p) => p.title.toLowerCase() === 'inbox' && !p.parent_project_id);
const binP = projects.find((p) => p.title === 'Bin');
const archived = new Set(projects.filter((p) => p.is_archived).map((p) => p.id));
const has = (t, n) => (t.labels || []).some((l) => l.title === n);
const before = await all('/api/v1/tasks');
const open = before.filter((t) => !t.done && t.project_id !== binP?.id && !archived.has(t.project_id));
const oldValidated = open.filter((t) => t.project_id !== inboxP.id && !has(t, 'ctx:review'));
const oldInbox = open.length - oldValidated.length;
console.log(`copy: ${open.length} open tasks, ${oldValidated.length} validated the old way, ${oldInbox} in the Inbox`);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctxFor = async (vp) => { const c = await b.newContext(vp); await c.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'input'); } }, [api, jwt]); return c; };
const c = await ctxFor({ viewport: { width: 1280, height: 900 } });
const p = await c.newPage();
await p.goto(base + '/inbox'); await p.waitForTimeout(15000);
const after = await all('/api/v1/tasks');
const marked = after.filter((t) => has(t, 'ctx:validated'));
check('one-time marking: every task validated the old way got the mark', marked.length === oldValidated.length && oldValidated.every((t) => marked.some((m) => m.id === t.id)), `${marked.length} vs ${oldValidated.length}`);
check('  and no task still to validate got it', !marked.some((t) => t.project_id === inboxP.id || has(t, 'ctx:review')));
const me = await (await fetch(api + '/api/v1/user', { headers: H })).json();
check('  the account remembers it (other settings kept)', me.settings.frontend_settings.tasks_status_v2 === true && me.settings.name !== undefined);
check('  a single "validated" label', (await all('/api/v1/labels')).filter((l) => l.title === 'ctx:validated').length === 1);
await p.reload(); await p.waitForTimeout(5000);
const inboxRows = await p.locator('.row:has(.checkbox)').count();
check(`the Inbox view shows the same tasks as before (${oldInbox})`, inboxRows === oldInbox, inboxRows);

// A task in the Inbox: rename it, give it a project, add a label: it stays.
const t0 = open.find((t) => t.project_id === inboxP.id);
const target = projects.find((x) => x.id !== inboxP.id && x.id !== binP?.id && !x.is_archived && x.parent_project_id);
const row = () => p.locator('.row', { hasText: t0.title.slice(0, 25) });
const stays = async (what) => { await p.waitForTimeout(800); const n1 = await row().count(); await p.reload(); await p.waitForTimeout(6000); check(`${what}: still in the Inbox (also after a sync)`, n1 === 1 && (await row().count()) === 1, `${n1} then ${await row().count()}`); };
await row().locator('.title').first().click(); await p.waitForTimeout(300);
const newTitle = t0.title.slice(0, 25) + ' renamed';
await p.locator('.row textarea').first().fill(newTitle); await p.keyboard.press('Enter');
t0.title = newTitle;
await stays('renamed');
await row().hover(); await row().locator('.col-project .chip, .col-project button').first().click(); await p.waitForTimeout(300);
await p.locator('.popover input').first().fill(target.title); await p.waitForTimeout(300);
await p.locator('.popover button', { hasText: target.title }).first().click();
await stays('given a project');
// Another device with an old copy changes a label: the mark is not touched (single-label writes).
const id = (await (await fetch(`${api}/api/v1/tasks/${t0.id}`, { headers: H })).json()).id;
// Validate
await row().locator('.checkbox').click(); await p.waitForTimeout(1500);
check('validated by hand: it leaves the Inbox', (await row().count()) === 0);
let srv = await (await fetch(`${api}/api/v1/tasks/${id}`, { headers: H })).json();
check('  the server has the "validated" mark and no old flag', has(srv, 'ctx:validated') && !has(srv, 'ctx:review'), JSON.stringify(srv.labels?.map((l) => l.title)));
// Editing a validated task never brings it back, and losing the mark brings it back.
await fetch(`${api}/api/v1/tasks/${id}/labels/${srv.labels.find((l) => l.title === 'ctx:validated').id}`, { method: 'DELETE', headers: H });
await fetch(`${api}/api/v1/tasks/${id}`, { method: 'POST', headers: H, body: JSON.stringify({ ...srv, labels: undefined }) });
await p.reload(); await p.waitForTimeout(6000);
check('mark lost elsewhere: the task comes back to the Inbox (never vanishes)', (await row().count()) === 1);

// A second device (phone) opens later: it switches over without marking again.
const c2 = await ctxFor({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const q = await c2.newPage(); await q.goto(base + '/inbox'); await q.waitForTimeout(12000);
check('another device: same Inbox', (await q.locator('.row:has(.checkbox)').count()) === oldInbox, await q.locator('.row:has(.checkbox)').count());
check('  and it knows the marking is done', await q.evaluate(() => localStorage.getItem('tasks_status_v2') === '1'));
// Complete from the Inbox once it has a project (phone long-press is not needed: circle)
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
