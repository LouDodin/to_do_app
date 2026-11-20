// "Show archived" lists archived projects in their place, under their parent, greyed out with an
// "archived" tag, like pending ones (11 Nov 2026: they were a separate flat list). TEST Vikunja only.
// Usage: node e2e/archived-tree.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const st = Date.now().toString(36).slice(-5);
const P = await req('PUT', '/api/v1/projects', { title: `ArchTree ${st}` });
const A = await req('PUT', '/api/v1/projects', { title: `ArchTree old ${st}`, parent_project_id: P.id });
const B = await req('PUT', '/api/v1/projects', { title: `ArchTree live ${st}`, parent_project_id: P.id });
const G = await req('PUT', '/api/v1/projects', { title: `ArchTree under old ${st}`, parent_project_id: A.id });
for (const x of [G, A]) { const cur = await req('GET', `/api/v1/projects/${x.id}`); await req('POST', `/api/v1/projects/${x.id}`, { ...cur, is_archived: true }); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
const p = await ctx.newPage();
await p.goto(base + '/'); await p.waitForTimeout(6000);
const rows = async () => p.locator('aside .tree [style*="padding-left"]').evaluateAll((els) => els.map((e) => ({ t: e.querySelector('.title')?.textContent?.trim(), d: parseInt(e.style.paddingLeft), tag: e.querySelector('.badge')?.textContent?.trim() ?? '' })));
let r = await rows();
check('archived projects are hidden at first', r.some((x) => x.t === `ArchTree live ${st}`) && !r.some((x) => x.t?.startsWith(`ArchTree old ${st}`)), JSON.stringify(r.filter((x) => x.t?.startsWith('ArchTree'))));
await p.getByRole('button', { name: 'archived', exact: true }).click(); await p.waitForTimeout(600);
r = (await rows()).filter((x) => x.t?.startsWith('ArchTree'));
const at = (t) => r.findIndex((x) => x.t === t);
const parent = r[at(`ArchTree ${st}`)], old = r[at(`ArchTree old ${st}`)], under = r[at(`ArchTree under old ${st}`)];
check('"Show archived": the archived sub-project is under its parent', old && parent && old.d === parent.d + 14 && at(`ArchTree old ${st}`) > at(`ArchTree ${st}`), JSON.stringify(r));
check('…tagged "archived", greyed out', old?.tag === 'archived' && (await p.locator('aside .title.dim', { hasText: `ArchTree old ${st}` }).count()) === 1);
check('…and its own archived sub-project under it', under && under.d === old.d + 14 && at(`ArchTree under old ${st}`) === at(`ArchTree old ${st}`) + 1, JSON.stringify(r));
check('the active sub-project stays as it was', r[at(`ArchTree live ${st}`)]?.tag === '' && r[at(`ArchTree live ${st}`)]?.d === parent.d + 14);
check('no separate list of archived projects any more', (await p.locator('aside .archived').count()) === 0);
await p.getByRole('button', { name: 'archived', exact: true }).click(); await p.waitForTimeout(400);
check('switched off: hidden again', !(await rows()).some((x) => x.t?.startsWith(`ArchTree old ${st}`)));
console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
