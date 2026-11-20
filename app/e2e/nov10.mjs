// The changes of 10 Nov 2026: sections and their order shared between devices (the phone did not
// see them), sub-projects with their tasks on a parent project's page, pending tasks, Markdown in
// descriptions, "What's new", and "Seen by" on the warnings. TEST Vikunja only.
// Usage: node e2e/nov10.mjs <app> <api> <user> <pass> [stateDir]
import { chromium } from 'playwright-core';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
const [base, api, user, pass, stateDir = '/tmp/claude-0/t/state'] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => { const r = await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 500)}`); };
const st = Date.now().toString(36).slice(-5);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Fixtures
const P = await req('PUT', '/api/v1/projects', { title: `Nov10 ${st}` });
const K = await req('PUT', '/api/v1/projects', { title: `Nov10 kid ${st}`, parent_project_id: P.id });
const G = await req('PUT', '/api/v1/projects', { title: `Nov10 grandkid ${st}`, parent_project_id: K.id });
const mk = async (pid, title) => { const t = await req('PUT', `/api/v1/projects/${pid}/tasks`, { title }); await wait(1100); return t; };
const t1 = await mk(P.id, `alpha ${st}`), t2 = await mk(P.id, `beta ${st}`);
const k1 = await mk(K.id, `kid task ${st}`), g1 = await mk(G.id, `grandkid task ${st}`);
const labels = [];
for (let pg = 1; pg < 10; pg++) { const l = await req('GET', `/api/v1/labels?per_page=50&page=${pg}`); if (!l?.length) break; labels.push(...l); }
const todayL = labels.find((l) => l.title === 'today');
const validL = labels.find((l) => l.title === 'ctx:validated');
// (checked and retried: a write can fail while the test server is busy, "database is locked")
for (const l of [todayL, validL]) {
	for (let i = 0; i < 5 && l; i++) {
		await req('PUT', `/api/v1/tasks/${t2.id}/labels`, { label_id: l.id });
		if (((await req('GET', `/api/v1/tasks/${t2.id}`)).labels ?? []).some((x) => x.id === l.id)) break;
		await wait(1000);
	}
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts, extra = {}) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j, x]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, [api, jwt, extra]);
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};

// ---------- 1. Sections reach another device (the phone) ----------
const A = await open({ viewport: { width: 1280, height: 900 } });
let p = A.p;
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
await p.getByPlaceholder('New section…').fill(`Errands ${st}`);
await p.getByRole('button', { name: 'Add section' }).click();
await p.waitForTimeout(800);
await p.goto(`${base}/task/${t1.id}`); await p.waitForTimeout(1500);
const secSelect = p.locator('.field select').first();
await secSelect.selectOption({ label: `Errands ${st}` });
await p.waitForTimeout(6000); // the 3-second pause, then the account setting is written
const settings = (await req('GET', '/api/v1/user')).settings?.frontend_settings ?? {};
const rec = settings.tasks_sections?.[String(P.id)];
check('the section and the task in it are saved in the account', !!rec && rec.s.some((x) => x[1] === `Errands ${st}`) && Object.keys(rec.a).includes(String(t1.id)), JSON.stringify(rec));

const B = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await B.p.goto(`${base}/project/${P.id}`); await B.p.waitForTimeout(3000);
const phoneHeads = await B.p.locator('.section-header h2').allInnerTexts();
check('the phone sees the section', phoneHeads.some((h) => h.trim() === `Errands ${st}`), JSON.stringify(phoneHeads));
const inSection = await B.p.locator('section', { has: B.p.locator('.section-header h2', { hasText: `Errands ${st}` }) }).locator('.row .title').allInnerTexts();
check('…with its task in it', inSection.some((t) => t.includes(`alpha ${st}`)), JSON.stringify(inSection));

// Renamed on the phone → back on the computer
const h2 = B.p.locator('.section-header h2', { hasText: `Errands ${st}` });
await h2.click(); await B.p.keyboard.press('End'); await B.p.keyboard.type(' 2');
await B.p.locator('.title').first().focus().catch(() => {});
await B.p.evaluate(() => (document.activeElement)?.blur());
await B.p.waitForTimeout(6000);
await p.goto(`${base}/`); await p.waitForTimeout(1500);
await p.evaluate(() => window.dispatchEvent(new Event('focus')));
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(8000);
let deskHeads = await p.locator('.section-header h2').allInnerTexts();
if (!deskHeads.some((h) => h.trim() === `Errands ${st} 2`)) { await p.reload(); await p.waitForTimeout(8000); deskHeads = await p.locator('.section-header h2').allInnerTexts(); }
check('a rename on the phone reaches the computer', deskHeads.some((h) => h.trim() === `Errands ${st} 2`), JSON.stringify(deskHeads));
await B.ctx.close();

// ---------- 2. Sub-projects and their tasks on the parent's page ----------
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
const subsText = await p.locator('.subs').innerText().catch(() => '');
check('the parent lists its sub-projects (2, the grandchild too)', /Sub-projects \(2\)/.test(subsText), subsText);
check('…with their tasks', subsText.includes(`kid task ${st}`) && subsText.includes(`grandkid task ${st}`), subsText);
check('the parent’s own tasks are not repeated there', !subsText.includes(`alpha ${st}`));
await p.locator('.subs-toggle').click();
check('the sub-projects can be folded away', (await p.locator('.subs .sub').count()) === 0);
await p.locator('.subs-toggle').click();
await p.locator('.sub-title a', { hasText: `Nov10 kid ${st}` }).click(); await p.waitForTimeout(1500);
check('a sub-project’s name opens it', p.url().endsWith(`/project/${K.id}`), p.url());

// ---------- 3. Pending ----------
await p.goto(`${base}/`); await p.waitForTimeout(2500);
const onHome = async (t) => p.locator('.row .title', { hasText: t }).first().waitFor({ timeout: 12000 }).then(() => true, () => false);
const diag = async () => JSON.stringify({ server: (await req('GET', `/api/v1/tasks/${t2.id}`)).labels?.map((l) => l.title), heads: await p.locator('h2.section-title').allTextContents(), local: await p.evaluate((id) => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const g = r.result.transaction('tasks').objectStore('tasks').get(id); g.onsuccess = () => res(g.result ? { labels: g.result.labels?.map((l) => l.title), project: g.result.project_id, start: g.result.start_date } : null); }; }), t2.id) });
check('(the "today" task is on the home page first)', await onHome(`beta ${st}`), await diag());
await p.goto(`${base}/task/${t2.id}`); await p.waitForTimeout(1500);
await p.locator('.pend-toggle input').check();
await p.waitForTimeout(2500);
await p.goto(`${base}/`); await p.waitForTimeout(2000);
check('a pending task leaves the home page', (await p.locator('.row .title', { hasText: `beta ${st}` }).count()) === 0);
await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2000);
// Since 13 Nov 2026 pending tasks are hidden on the project page until ⋯ › Show pending tasks.
check('…hidden in its project by default', (await p.locator('.project-page > section').first().locator('.row .title', { hasText: `beta ${st}` }).count()) === 0);
await p.locator('.tools').getByRole('button', { name: /^Pending/ }).click(); await p.waitForTimeout(500);
const topTitles = await p.locator('.project-page > section').first().locator('.row .title').allInnerTexts();
check('…stays in its project, marked pending and at the end', topTitles.at(-1)?.includes(`beta ${st}`) && /pending/.test(topTitles.at(-1) ?? ''), JSON.stringify(topTitles));
const srv = await req('GET', `/api/v1/tasks/${t2.id}`);
check('…and the server has the mark (other devices)', (srv.labels ?? []).some((l) => l.title === 'ctx:pending'), JSON.stringify(srv.labels?.map((l) => l.title)));
check('the mark is not shown as a label', (await p.locator('.row', { hasText: `beta ${st}` }).locator('.labels').innerText()).indexOf('ctx:') < 0);
await p.goto(`${base}/task/${t2.id}`); await p.waitForTimeout(1500);
const pendBox = p.locator('.pend-toggle input');
await pendBox.uncheck(); await p.waitForTimeout(800);
check('resumed from its page', !(await pendBox.isChecked()));
await p.locator('.label', { hasText: 'Labels' }).click();
await p.keyboard.press('Control+z'); await p.waitForTimeout(1200);
check('undo puts it back on hold', await pendBox.isChecked());
await pendBox.uncheck(); await p.waitForTimeout(2500);
await p.goto(`${base}/`); await p.waitForTimeout(2000);
check('resumed: back on the home page', await onHome(`beta ${st}`), await diag());

// ---------- 4. Markdown description ----------
await p.goto(`${base}/task/${t1.id}`); await p.waitForTimeout(1500);
const ta = p.locator('textarea.desc-edit');
await ta.fill('**Bold** and *italic*\n\n- one\n- two\n\n[site](https://example.com) <img src=x onerror="window.__x=1">');
await p.locator('.label', { hasText: 'Labels' }).click(); // blur
await p.waitForTimeout(1500);
const view = p.locator('.desc-view');
check('the description is shown formatted', (await view.locator('strong').innerText().catch(() => '')) === 'Bold' && (await view.locator('em').count()) === 1 && (await view.locator('li').count()) === 2);
check('links open in a new tab', (await view.locator('a').getAttribute('target')) === '_blank');
check('no script runs from a description', !(await p.evaluate(() => window.__x)) && !(await view.innerHTML()).includes('onerror'));
await view.locator('li').first().click();
check('a click on the text edits it (Markdown source)', (await p.locator('textarea.desc-edit').inputValue()).startsWith('**Bold**'));
await p.locator('.label', { hasText: 'Labels' }).click(); await p.waitForTimeout(1500);
check('saved on the server as written', (await req('GET', `/api/v1/tasks/${t1.id}`)).description.startsWith('**Bold**'));

// ---------- 5. What's new ----------
await A.ctx.close();
const C = await open({ viewport: { width: 1280, height: 900 } }, { news_test: '1' });
const card = C.p.locator('.news[role=dialog]');
check('"What’s new" appears after an update', await card.isVisible(), '');
const latestTitle = readFileSync(new URL('../src/lib/news.ts', import.meta.url), 'utf8').match(/title: '([^']+)'/)[1];
check('…with the latest update’s news', (await card.innerText()).includes(latestTitle), latestTitle);
await card.getByRole('button', { name: 'Got it' }).click();
await C.p.reload(); await C.p.waitForTimeout(5000);
check('…once only', (await C.p.locator('.news[role=dialog]').count()) === 0);
await C.p.keyboard.press('?'); await C.p.waitForTimeout(800);
await C.p.getByRole('tab', { name: 'Updates' }).click(); await C.p.waitForTimeout(500);
check('Help centre > Updates lists every update', (await C.p.locator('.updates').innerText()).includes('6 Nov 2026'));
await C.ctx.close();

// ---------- 6. "Seen by" on the admin's warnings ----------
// The test account is the main one (the automation token is hers), as on the PC.
{
	const full = await req('GET', '/api/v1/routes');
	const perms = Object.fromEntries(Object.entries(full).map(([k, v]) => [k, Object.keys(v)]));
	const t = await req('PUT', '/api/v1/tokens', { title: `main test ${st}`, expires_at: '2099-01-01T00:00:00Z', permissions: perms });
	writeFileSync(`${stateDir}/automation-token.txt`, t.token);
}
const hf = `${stateDir}/health.json`;
writeFileSync(hf, JSON.stringify({ generated: new Date().toISOString(), status: 'warn', checks: [
	{ name: 'Server thing', status: 'warn', detail: 'test' },
	{ name: 'Alex devices', status: 'warn', detail: 'test', account: 'Alex' },
	{ name: 'My devices', status: 'warn', detail: 'test', account: user }
] }));
const D = await open({ viewport: { width: 1280, height: 900 } });
await D.p.keyboard.press('?'); await D.p.waitForTimeout(1000);
await D.p.getByRole('tab', { name: 'Status' }).click(); await D.p.waitForTimeout(2000);
const issues = await D.p.locator('.issue').allInnerTexts();
const seen = (name) => issues.find((t) => t.includes(name))?.match(/Seen by: (.*)/)?.[1] ?? '';
check('Seen by: everyone, for a server warning', seen('Server thing').startsWith('everyone'), JSON.stringify(issues));
check('Seen by: you and Alex, for an Alex warning', seen('Alex devices').includes('Alex') && seen('Alex devices').startsWith('you'), seen('Alex devices'));
check('Seen by: only you, for your own', seen('My devices').startsWith('only you'), seen('My devices'));
await D.ctx.close();
rmSync(hf, { force: true });
rmSync(`${stateDir}/automation-token.txt`, { force: true });

console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
