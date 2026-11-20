// Abandon a task (11 Nov 2026): closed without being done, should not be done any more; since
// 13 Nov 2026 it goes to the Bin, like a deleted task. TEST
// Vikunja only. Usage: node e2e/abandon.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const st = Date.now().toString(36).slice(-5);
const P = await req('PUT', '/api/v1/projects', { title: `Abandon ${st}` });
const A = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `give up ${st}` }); await wait(1100);
const R = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `weekly thing ${st}`, due_date: new Date(Date.now() + 864e5).toISOString(), repeat_after: 604800 }); await wait(1100);
const get = (id) => req('GET', `/api/v1/tasks/${id}`);
const abandoned = (t) => (t.labels ?? []).some((l) => l.title === 'ctx:abandoned');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
await p.goto(`${base}/weekly`); await p.waitForTimeout(2500);

await p.goto(`${base}/task/${A.id}`); await p.waitForTimeout(2000);
await p.locator('.actions').getByRole('button', { name: 'Abandon', exact: true }).click(); await wait(3000);
let t = await get(A.id);
const binId = async () => ((await req('GET', '/api/v1/projects?per_page=200')) ?? []).find((x) => x.title === 'Bin')?.id;
check('Abandon: closed on the server, marked abandoned, in the Bin', t.done === true && abandoned(t) && t.project_id === (await binId()), JSON.stringify({ done: t.done, project: t.project_id, labels: t.labels?.map((l) => l.title) }));
check('…the page goes back', !p.url().includes(`/task/${A.id}`), p.url());
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2000);
check('…it leaves its project', !(await p.locator('main').innerText()).includes(`give up ${st}`));
await p.goto(`${base}/bin`); await p.waitForTimeout(1500);
const binRow = p.locator('.row', { hasText: `give up ${st}` });
check('…it is in the Bin, as "Abandoned"', (await binRow.count()) === 1 && (await binRow.innerText()).includes('Abandoned'));
await p.goto(`${base}/weekly`); await p.waitForTimeout(2500);
// 13 Nov 2026: the Weekly review has no figures any more; an abandoned task is not among the tasks to do there.
check('…not in the Weekly review', !(await p.locator('.review').innerText()).includes(`give up ${st}`));
await p.goto(`${base}/bin`); await p.waitForTimeout(1500);
await binRow.getByRole('button', { name: 'Restore' }).click(); await wait(3500);
t = await get(A.id);
check('Restore from the Bin: open again, no longer abandoned, in the Inbox', t.done === false && !abandoned(t) && t.project_id !== (await binId()), JSON.stringify({ done: t.done, project: t.project_id, labels: t.labels?.map((l) => l.title) }));

await p.goto(`${base}/task/${R.id}`); await p.waitForTimeout(1500);
await p.locator('.actions').getByRole('button', { name: 'Abandon', exact: true }).click(); await wait(3000);
t = await get(R.id);
check('a repeating task abandoned is closed for good (does not move to its next date), in the Bin', t.done === true && abandoned(t) && !t.repeat_after && t.project_id === (await binId()), JSON.stringify({ done: t.done, rep: t.repeat_after }));

console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
