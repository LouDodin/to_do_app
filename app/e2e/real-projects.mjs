// Real Vikunja (LOCAL test copy only): project lifecycle as the app does it.
// Usage: node e2e/real-projects.mjs <appBase> <apiBase> <jwt>
import { chromium } from 'playwright-core';
const [base, api, jwt] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const get = async (p) => (await fetch(api + p, { headers: { Authorization: `Bearer ${jwt}` } })).json();
const projectsNow = async () => { let all = []; for (let pg = 1; pg < 5; pg++) { const b = await get(`/api/v1/projects?is_archived=true&page=${pg}&per_page=50`); if (!b.length) break; all = all.concat(b); if (b.length < 50) break; } return all; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
await page.goto(base + '/'); await page.waitForTimeout(6000);
const stamp = Date.now().toString(36);
const perso = (await projectsNow()).find((p) => p.title.toLowerCase() === 'personal development') || (await projectsNow()).find((p) => p.id > 0 && !p.parent_project_id && p.title !== 'INBOX');

// 1. New sub-project under an existing top-level project
const name = `e2e_project_${stamp}`;
await page.locator('[aria-label="New project"]').click(); await page.waitForTimeout(300);
await page.fill('input[placeholder="Project name"]', name);
await page.getByText('None (top level)').click(); await page.waitForTimeout(400);
await page.locator('.float button', { hasText: perso.title }).first().click(); await page.waitForTimeout(300);
await page.locator('[role=dialog] .btn-primary', { hasText: 'Create' }).click(); await page.waitForTimeout(3000);
let p = (await projectsNow()).find((x) => x.title === name);
check('project: created on the server', !!p, name);
check('project: under the chosen parent', p?.parent_project_id === perso.id, `${p?.parent_project_id} vs ${perso.id}`);
const before = (await projectsNow()).filter((x) => x.parent_project_id === perso.id && x.id !== p?.id).map((x) => x.position);
check('project: added at the bottom of its parent', before.every((pos) => (p?.position ?? 0) > pos), JSON.stringify({ mine: p?.position, max: Math.max(...before) }));

// 2. A task in it, then archive is refused while it is open
await page.goto(`${base}/project/${p.id}`); await page.waitForTimeout(2000);
await page.keyboard.press('n'); await page.waitForTimeout(400);
await page.locator('input[placeholder="Task"]').first().fill(`e2e task in project ${stamp} #${name}`);
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
const tasks = await get(`/api/v1/tasks?per_page=50&s=${encodeURIComponent('e2e task in project ' + stamp)}`);
const t = tasks[0];
check('quick add "#project": the task lands in that project', t?.project_id === p.id, JSON.stringify(t && { pid: t.project_id, title: t.title }));

// 3. Delete the project: its open task goes back to the Inbox, nothing open is deleted
await page.locator('[role=treeitem]', { hasText: name }).first().click({ button: 'right' }); await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Delete' }).last().click(); await page.waitForTimeout(4000);
const gone = !(await projectsNow()).some((x) => x.id === p.id);
check('delete project: removed from the server', gone);
const t2 = await get(`/api/v1/tasks/${t.id}`);
const inbox = (await projectsNow()).find((x) => x.title.toLowerCase() === 'inbox');
check('delete project: its open task is kept, back in the Inbox', t2.id === t.id && t2.project_id === inbox.id && !t2.done, JSON.stringify({ id: t2.id, pid: t2.project_id }));
await page.waitForTimeout(500);
check('delete project: gone from the app tree', (await page.locator('[role=treeitem]', { hasText: name }).count()) === 0);
check('no JavaScript errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
