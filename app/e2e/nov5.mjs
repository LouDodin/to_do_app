// The app tasks of 5 Nov 2026: capitals, no password-manager prompts, Archive on the project page,
// sections (add into one, reorder, move without dragging), order of a project's tasks (newest,
// oldest, dragged), several tasks selected at once, Undo / Redo, today's summary, a sub-project
// dragged to the first place, menus opening upwards. TEST Vikunja only.
// Usage: node e2e/nov5.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 500)}`); };
const st = Date.now().toString(36).slice(-5);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Fixtures
const P = await req('PUT', '/api/v1/projects', { title: `Nov5 ${st}` });
const Q = await req('PUT', '/api/v1/projects', { title: `Nov5 other ${st}` });
const E = await req('PUT', '/api/v1/projects', { title: `Nov5 empty ${st}` });
const Par = await req('PUT', '/api/v1/projects', { title: `Nov5 parent ${st}` });
const kA = await req('PUT', '/api/v1/projects', { title: `Nov5 kidA ${st}`, parent_project_id: Par.id });
const kB = await req('PUT', '/api/v1/projects', { title: `Nov5 kidB ${st}`, parent_project_id: Par.id });
const mk = async (pid, title) => { const t = await req('PUT', `/api/v1/projects/${pid}/tasks`, { title }); await wait(1100); return t; };
const t1 = await mk(P.id, `first ${st}`), t2 = await mk(P.id, `second ${st}`), t3 = await mk(P.id, `third ${st}`);
const labels = await req('GET', '/api/v1/labels?per_page=200');
const todayL = labels.find((l) => l.title === 'today');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.removeItem('project_order'); }, [api, jwt]);
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept());
await p.goto(base + '/'); await p.waitForTimeout(6000);
const titles = async (sel = '.project-page') => p.locator(`${sel} .row .title`).allInnerTexts();
const toast = async () => (await p.locator('.toast, [role=status], [role=alert]').allInnerTexts()).join(' | ');

// 1. Project page: capital letter, no password manager, order
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
const box = p.getByPlaceholder('Add a task to this project…');
check('the add-a-task box is marked "not a sign-in field" for password managers', (await box.getAttribute('data-bwignore')) === 'true' && (await box.getAttribute('autocomplete')) === 'off');
await box.fill(`lower case ${st}`); await box.press('Enter'); await p.waitForTimeout(3000);
check('a new task starts with a capital letter', (await titles()).includes(`Lower case ${st}`), JSON.stringify(await titles()));
check('oldest first by default', (await titles())[0] === `first ${st}`, JSON.stringify(await titles()));
await p.getByRole('button', { name: /Oldest first/ }).click(); await p.waitForTimeout(500);
check('"Newest first": the newest at the top', (await titles())[0] === `Lower case ${st}`, JSON.stringify(await titles()));
await p.getByRole('button', { name: /Newest first/ }).click(); await p.waitForTimeout(500); // -> my order
await p.getByRole('button', { name: /My order/ }).click(); await p.waitForTimeout(500); // -> oldest

// 2. Drag a task onto another: your own order
const row = (t) => p.locator('.project-page .slot', { hasText: t }).first();
await row(`third ${st}`).locator('.row').dragTo(row(`first ${st}`), { targetPosition: { x: 200, y: 3 } }); await p.waitForTimeout(1500);
const afterDrag = await titles();
check('a task dragged onto the first one goes before it ("My order")', afterDrag[0] === `third ${st}` && afterDrag[1] === `first ${st}` && (await p.getByRole('button', { name: /My order/ }).count()) === 1, JSON.stringify(afterDrag));

// 3. Sections: add, add a task into one, reorder, move a task without dragging
const sec = p.getByPlaceholder('New section…');
await sec.fill('Alpha'); await sec.press('Enter'); await p.waitForTimeout(400);
await sec.fill('Beta'); await sec.press('Enter'); await p.waitForTimeout(600);
const sectionBox = (name) => p.locator('.project-page section', { has: p.locator('h2', { hasText: name }) });
await sectionBox('Beta').getByPlaceholder('Add a task to this section…').fill(`in beta ${st}`);
await sectionBox('Beta').getByPlaceholder('Add a task to this section…').press('Enter'); await p.waitForTimeout(2500);
check('a task added in a section is in that section', (await sectionBox('Beta').locator('.row .title').allInnerTexts()).includes(`In beta ${st}`), await sectionBox('Beta').innerText());
await sectionBox('Beta').getByRole('button', { name: 'Move the section up' }).click(); await p.waitForTimeout(500);
const order = await p.locator('.project-page h2').allInnerTexts();
check('a section moves up', order.indexOf('Beta') < order.indexOf('Alpha'), JSON.stringify(order));
await p.goto(`${base}/task/${t2.id}`); await p.waitForTimeout(1500);
await p.locator('.field', { hasText: 'Section' }).locator('select').selectOption({ label: 'Alpha' }); await p.waitForTimeout(500);
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2000);
check('the task page moves a task to another section (no dragging)', (await sectionBox('Alpha').locator('.row .title').allInnerTexts()).includes(`second ${st}`), await sectionBox('Alpha').innerText());

// 4. Several tasks at once: Ctrl-click, move to another project, then Undo / Redo
await row(`third ${st}`).locator('.title').click({ modifiers: ['Control'] });
await row(`first ${st}`).locator('.title').click({ modifiers: ['Control'] }); await p.waitForTimeout(400);
check('Ctrl-click selects several tasks: the bar says 2 selected', /2 selected/.test(await p.locator('.bulk').innerText().catch(() => '')), await p.locator('.bulk').innerText().catch(() => 'no bar'));
await p.locator('.bulk').getByRole('button', { name: 'Move' }).click();
await p.locator('.bulk').getByPlaceholder('Search a project…').fill(`Nov5 other ${st}`);
await p.locator('.bulk-pop .option', { hasText: `Nov5 other ${st}` }).click(); await p.waitForTimeout(4000);
const moved = await Promise.all([t1.id, t3.id].map((id) => req('GET', `/api/v1/tasks/${id}`)));
check('both moved to the other project, on the server', moved.every((t) => t.project_id === Q.id), JSON.stringify(moved.map((t) => t.project_id)));
await p.locator('body').click({ position: { x: 640, y: 880 } });
await p.keyboard.press('Control+z'); await p.waitForTimeout(4000);
const back = await Promise.all([t1.id, t3.id].map((id) => req('GET', `/api/v1/tasks/${id}`)));
check('Ctrl+Z: both back in their project (one step), on the server', back.every((t) => t.project_id === P.id), JSON.stringify(back.map((t) => t.project_id)) + ' ' + (await toast()));
await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(4000);
const again = await Promise.all([t1.id, t3.id].map((id) => req('GET', `/api/v1/tasks/${id}`)));
check('Ctrl+Shift+Z: moved again (redo)', again.every((t) => t.project_id === Q.id), JSON.stringify(again.map((t) => t.project_id)));
await p.keyboard.press('Control+z'); await p.waitForTimeout(3000);
// Undo a completion, with the button in the top bar
await p.waitForTimeout(1500); // let the undo above reach the server first
await row(`second ${st}`).locator('.checkbox').click(); await p.waitForTimeout(4000);
check('completing a task', (await req('GET', `/api/v1/tasks/${t2.id}`)).done === true);
await p.getByRole('button', { name: 'Undo', exact: true }).click(); await p.waitForTimeout(1200);
const said = await toast();
await p.waitForTimeout(2500);
const reopened = await req('GET', `/api/v1/tasks/${t2.id}`);
check('the Undo button reopens it', reopened.done === false && /Undone: Complete/.test(said), JSON.stringify({ done: reopened.done, said }));

// 5. Archive from the project page
await p.locator('.project-page .header').getByRole('button', { name: 'Archive', exact: true }).click(); await p.waitForTimeout(2500);
check('Archive on the project page: refused while tasks are open', (await req('GET', `/api/v1/projects/${P.id}`)).is_archived === false && /open task/.test(await toast()), await toast());
await p.goto(`${base}/project/${E.id}`); await p.waitForTimeout(2000);
await p.locator('.project-page .header').getByRole('button', { name: 'Archive', exact: true }).click(); await p.waitForTimeout(3500);
check('and done for a finished one', (await req('GET', `/api/v1/projects/${E.id}`)).is_archived === true, await toast());

// 6. What was planned for today
await req('PUT', `/api/v1/tasks/${t2.id}/labels`, { label_id: todayL.id });
await p.goto(`${base}/`); await p.waitForTimeout(4000);
await p.goto(`${base}/today-review`); await p.waitForTimeout(4000);
// 13 Nov 2026: no summary of past work any more; a planned task not done is in the first section.
for (let k = 0; k < 8 && !(await p.locator('[data-step="leftover"]').count()); k++) await p.waitForTimeout(2000);
check("Tomorrow's priorities: the planned task, not done, is under Planned for today, not done", (await p.locator('[data-step="leftover"] .row', { hasText: `second ${st}` }).count()) === 1);
await req('POST', `/api/v1/tasks/${t2.id}`, { ...(await req('GET', `/api/v1/tasks/${t2.id}`)), done: true });
await p.waitForTimeout(1000); await p.reload(); await p.waitForTimeout(5000);
check('completed: it is no longer there (only what is ahead)', (await p.locator('.review .row', { hasText: `second ${st}` }).count()) === 0);

// 7. A sub-project dragged just under its parent becomes the first one
await p.goto(`${base}/`); await p.waitForTimeout(2500);
const item = (t) => p.locator('.panel .item', { hasText: t }).first();
await item(`Nov5 kidB ${st}`).dragTo(item(`Nov5 parent ${st}`), { targetPosition: { x: 60, y: 24 } }); await p.waitForTimeout(3000);
const ps = await req('GET', '/api/v1/projects?per_page=300');
const a = ps.find((x) => x.id === kA.id), b = ps.find((x) => x.id === kB.id);
check('a sub-project dropped just under its parent becomes its first sub-project', b.parent_project_id === Par.id && b.position < a.position, JSON.stringify({ a: [a.parent_project_id, a.position], b: [b.parent_project_id, b.position] }));

// 8. A menu near the bottom opens upwards
await p.setViewportSize({ width: 1280, height: 420 });
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2000);
const last = p.locator('.project-page .row').last();
await last.scrollIntoViewIfNeeded();
await last.getByRole('button', { name: 'Change project' }).click(); await p.waitForTimeout(500);
const pop = await p.locator('.project-page .anchor', { has: p.locator('.popover') }).first().boundingBox();
check('a menu with no room below opens upwards (stays in the window)', !!pop && pop.y + pop.height <= 420 + 1, JSON.stringify(pop));

// 9. Shopping (6 Nov 2026): 🛒 in the new-task box, on a task's page, the Shopping page
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto(`${base}/`); await p.waitForTimeout(2000);
await p.keyboard.press('n'); await p.waitForTimeout(600);
const qa = p.locator('[role=dialog] .quick-add');
await qa.locator('input.title-input').fill(`oat milk ${st}`);
await qa.getByRole('button', { name: 'Shopping' }).click();
await qa.locator('input.title-input').press('Enter'); await p.waitForTimeout(4000);
const all = await req('GET', '/api/v1/tasks?per_page=200&s=' + encodeURIComponent(`oat milk ${st}`));
const milk = all.find((t) => t.title === `Oat milk ${st}`);
const projs = await req('GET', '/api/v1/projects?per_page=300');
const shopP = projs.find((x) => x.id === milk?.project_id && x.title === 'Shopping' && !x.parent_project_id);
check('🛒 in the new-task box: a shopping item, in the Shopping project, validated (skips the Inbox)', !!milk && milk.project_id === shopP?.id && milk.labels.some((l) => l.title === 'shopping') && milk.labels.some((l) => l.title === 'ctx:validated'), JSON.stringify(milk && { p: milk.project_id, shop: shopP?.id, l: milk.labels.map((l) => l.title) }));
const inboxItem = await req('PUT', `/api/v1/projects/${projs.find((x) => /^inbox$/i.test(x.title)).id}/tasks`, { title: `batteries ${st}` });
await p.goto(`${base}/`); await p.waitForTimeout(3000);
await p.goto(`${base}/task/${inboxItem.id}`); await p.waitForTimeout(2000);
await p.locator('.shop-toggle input').check(); await p.waitForTimeout(4000);
const bat = await req('GET', `/api/v1/tasks/${inboxItem.id}`);
check("🛒 on an Inbox task's page: it leaves the Inbox for the Shopping list", bat.project_id === shopP?.id && bat.labels.some((l) => l.title === 'shopping') && bat.labels.some((l) => l.title === 'ctx:validated'), JSON.stringify({ p: bat.project_id, l: bat.labels?.map((l) => l.title) }));
const shopLabel = labels.find((l) => l.title === 'biocoop') ?? (await req('PUT', '/api/v1/labels', { title: 'biocoop' }));
await req('PUT', `/api/v1/tasks/${inboxItem.id}/labels`, { label_id: shopLabel.id });
await p.goto(`${base}/`); await p.waitForTimeout(3000);
await p.goto(`${base}/shopping`); await p.waitForTimeout(2000);
const shopText = await p.locator('.shopping').innerText();
check('the Shopping page lists both, grouped by shop', shopText.includes(`Oat milk ${st}`) && /biocoop\s+batteries/i.test(shopText), shopText);
await p.getByRole('button', { name: `Tick off Oat milk ${st}` }).click(); await p.waitForTimeout(3000);
const milk2 = await req('GET', `/api/v1/tasks/${milk.id}`), shop2 = await p.locator('.shopping').innerText();
check('ticking an item off completes it; it stays in "Ticked off"', milk2.done === true && /Ticked off[\s\S]*Oat milk/i.test(shop2), JSON.stringify({ done: milk2.done, shop2 }));
await p.goto(`${base}/`); await p.waitForTimeout(1500);
const home = await p.locator('main').innerText();
check('shopping items are not on the home page blocks', !home.includes(`batteries ${st}`), home);
await req('DELETE', `/api/v1/tasks/${milk.id}`); await req('DELETE', `/api/v1/tasks/${inboxItem.id}`);

await browser.close();
// Tidy up
for (const t of [t1, t2, t3]) await req('DELETE', `/api/v1/tasks/${t.id}`);
for (const x of [kA, kB, Par, E, Q, P]) await req('DELETE', `/api/v1/projects/${x.id}`);
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
