// The project page reworked (11 Nov 2026, Lou Canava): sections moved by dragging their handle
// (mouse and finger), folded, ⋯ menu (Move up / Move down / Delete), tight spacing. TEST Vikunja only.
// Usage: node e2e/project-page.mjs <app> <api> <user> <pass> [shots dir]
import { chromium } from 'playwright-core';
const [base, api, user, pass, shots] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const st = Date.now().toString(36).slice(-4);
const P = await req('PUT', '/api/v1/projects', { title: `Sections ${st}` });
for (const t of ['loose one', 'loose two']) await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `${t} ${st}` });
{
	// The test server sometimes refuses a write under load: tried again until it is there.
	const mk = async (title) => { for (let k = 0; k < 6; k++) { const t = await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title }); if (t?.id) return t; await new Promise((r) => setTimeout(r, 500)); } throw new Error('could not create ' + title); };
	const held = await mk(`held ${st}`);
	const done = await mk(`finished ${st}`);
	for (let k = 0; k < 6; k++) { const r = await req('POST', `/api/v1/tasks/${done.id}`, { ...done, done: true }); if (r?.done) break; await new Promise((r) => setTimeout(r, 500)); }
	let all = []; for (let pg = 1; pg < 20; pg++) { const l = await req('GET', `/api/v1/labels?per_page=50&page=${pg}`); if (!l?.length) break; all = all.concat(l); }
	let lab = all.find((l) => l.title === 'ctx:pending'); if (!lab) lab = await req('PUT', '/api/v1/labels', { title: 'ctx:pending', hex_color: '9e9e9e' });
	for (let k = 0; k < 6; k++) { await req('PUT', `/api/v1/tasks/${held.id}/labels`, { label_id: lab.id }); const t = await req('GET', `/api/v1/tasks/${held.id}`); if ((t?.labels ?? []).some((l) => l.id === lab.id)) break; await new Promise((r) => setTimeout(r, 500)); }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());
	if (process.env.DBG) { p.on('console', (m) => m.type() === 'error' && console.log('DBG console', m.text().slice(0, 160))); p.on('request', (r) => r.url().includes('/api/v1/user') && console.log('DBG req', r.method(), r.url())); p.on('request', (r) => r.url().includes('/user/settings') && console.log('DBG post', (r.postData() ?? '').match(/tasks_sections.{0,120}/)?.[0])); p.on('response', (r) => r.url().includes('/user/settings') && console.log('DBG resp', r.status())); }
	await p.goto(base + '/'); await p.waitForTimeout(5000);
	await p.goto(base + `/project/${P.id}`); await p.waitForTimeout(3000);
	return { ctx, p };
};
const heads = async (p) => (await p.locator('.section-header h2').allInnerTexts()).map((t) => t.trim());
const box = (p, name) => p.locator('.project-page section', { has: p.locator('h2', { hasText: name }) });
// Drag the handle of section `name` to just above the header of section `target` (or below the last one).
async function drag(p, name, target, by = '.grip') {
	const g = await box(p, name).locator(by).boundingBox();
	await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
	let y;
	if (target) { const h = await box(p, target).locator('.section-header').boundingBox(); y = h.y + 4; }
	else { const all = p.locator('.section-header'); const h = await all.nth((await all.count()) - 1).boundingBox(); y = h.y + h.height + 20; }
	for (let k = 1; k <= 8; k++) await p.mouse.move(g.x + 5, g.y + ((y - g.y) * k) / 8);
	await p.mouse.up(); await p.waitForTimeout(800);
}
{
	const { ctx, p } = await open({ viewport: { width: 1300, height: 900 } });
	for (const s of ['Alpha', 'Beta', 'Gamma']) { await p.getByPlaceholder('New section…').fill(s); await p.keyboard.press('Enter'); await p.waitForTimeout(700); }
	for (const [s, t] of [['Alpha', 'a1'], ['Alpha', 'a2'], ['Beta', 'b1'], ['Gamma', 'g1']]) {
		await box(p, s).getByRole('button', { name: `New task in ${s}` }).click();
		await p.getByRole('dialog').getByLabel('Task', { exact: true }).fill(`${t} ${st}`);
		await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
	}
	check('+ on a section opens the window with that section chosen, and the task lands there', (await box(p, 'Gamma').innerText()).toLowerCase().includes(`g1 ${st}`));
	{
		const txt = async () => (await p.locator('.project-page').innerText()).toLowerCase();
		check('a pending task is hidden by default', !(await txt()).includes(`held ${st}`) && (await p.locator('.meta').count()) === 0 && (await p.locator('.section-header .count').allInnerTexts()).every((x) => !x.trim()), 'no counts');
		check('a completed task is hidden by default', !(await txt()).includes(`finished ${st}`));
		check('computer: the options are in view, no ⋯', (await p.locator('.tools').isVisible()) && !(await p.getByRole('button', { name: 'Project actions' }).isVisible()));
		await p.locator('.tools').getByRole('button', { name: 'Pending', exact: true }).click(); await p.waitForTimeout(400);
		check('⋯ › Show pending tasks shows it', (await txt()).includes(`held ${st}`));
		await p.locator('.tools').getByRole('button', { name: 'Completed', exact: true }).click(); await p.waitForTimeout(400);
		check('⋯ › Show completed shows it', (await txt()).includes(`finished ${st}`));
		await p.locator('.tools').getByRole('button', { name: 'Pending', exact: true }).click();
		await p.locator('.tools').getByRole('button', { name: 'Completed', exact: true }).click(); await p.waitForTimeout(400);
		check('…and hides them again', !(await txt()).includes(`held ${st}`) && !(await txt()).includes(`finished ${st}`));
	}
	{
		const op = async (name) => Number(await box(p, name).locator('.grip').evaluate((el) => getComputedStyle(el).opacity));
		await p.mouse.move(5, 5); await p.waitForTimeout(200);
		check('the handle ⠿ is hidden until the pointer is over the section', (await op('Alpha')) === 0);
		await box(p, 'Alpha').locator('.section-header').hover(); await p.waitForTimeout(200);
		check('…and shown on hover', (await op('Alpha')) === 1);
	}
	// The new task window: a click outside first closes an open menu, then the window
	{
		await p.getByRole('button', { name: 'New task in this project' }).click(); await p.waitForTimeout(400);
		const dlg = p.getByRole('dialog', { name: 'New task' });
		await dlg.getByLabel('Task', { exact: true }).fill('not to keep');
		await dlg.getByRole('button', { name: 'Labels' }).click(); await p.waitForTimeout(200);
		check('new task window: the labels menu opens', (await dlg.locator('.labels-pop').count()) === 1);
		const firstLabel = (await dlg.locator('.labels-pop .opt').first().innerText()).trim();
		await dlg.locator('.labels-pop .opt').first().click(); await p.waitForTimeout(200);
		check('…a label chosen shows by its name in the row, with ×', (await dlg.getByRole('button', { name: `Remove ${firstLabel}`, exact: true }).count()) === 1 && (await dlg.locator('.bar').innerText()).includes(firstLabel), firstLabel);
		await p.mouse.click(30, 850); await p.waitForTimeout(300);
		check('…a click outside closes the menu only', (await dlg.locator('.labels-pop').count()) === 0 && (await dlg.isVisible()));
		check('…the key tips are shown', (await dlg.innerText()).includes('Enter: add · ⌘/Ctrl+Enter: add another · Esc: close'));
		await p.mouse.click(30, 850); await p.waitForTimeout(300);
		check('…a second click closes the window, nothing added', !(await dlg.isVisible()) && !(await p.locator('.project-page').innerText()).includes('Not to keep'));
	}
	check('three sections, in order', JSON.stringify(await heads(p)) === '["Alpha","Beta","Gamma"]', JSON.stringify(await heads(p)));
	check('an empty section shows no "No tasks" line', !(await p.locator('.project-page').innerText()).includes('No tasks'));
	const hb = await box(p, 'Alpha').locator('.section-header').boundingBox(); const r1 = await box(p, 'Alpha').locator('.row').first().boundingBox();
	check('the first task sits right under its section title', r1.y - (hb.y + hb.height) < 12, r1.y - (hb.y + hb.height));
	if (shots) await p.screenshot({ path: `${shots}/project-desk.png` });
	await drag(p, 'Gamma', 'Alpha');
	check('drag Gamma above Alpha: it goes first', JSON.stringify(await heads(p)) === '["Gamma","Alpha","Beta"]', JSON.stringify(await heads(p)));
	await drag(p, 'Gamma', null);
	check('drag Gamma below the last: it goes last', JSON.stringify(await heads(p)) === '["Alpha","Beta","Gamma"]', JSON.stringify(await heads(p)));
	check('the tasks moved with their section', (await box(p, 'Gamma').locator('.row .title').allInnerTexts()).some((t) => t.includes(`g1 ${st}`.replace(/^./, (c) => c.toUpperCase()))) || (await box(p, 'Gamma').innerText()).toLowerCase().includes(`g1 ${st}`));
	await box(p, 'Beta').getByRole('button', { name: 'Section actions' }).click();
	await p.getByRole('button', { name: 'Move the section up' }).click(); await p.waitForTimeout(600);
	check('⋯ › Move up', JSON.stringify(await heads(p)) === '["Beta","Alpha","Gamma"]', JSON.stringify(await heads(p)));
	await drag(p, 'Gamma', 'Beta', 'h2');
	check('drag a section by its title (mouse): it moves', JSON.stringify(await heads(p)) === '["Gamma","Beta","Alpha"]', JSON.stringify(await heads(p)));
	check('…and the title is not left in editing', (await p.evaluate(() => document.activeElement?.tagName)) !== 'H2');
	await drag(p, 'Gamma', null, 'h2');
	await box(p, 'Alpha').locator('h2').click(); await p.keyboard.press('End'); await p.keyboard.type('X'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
	check('a simple click on a title still renames it', JSON.stringify(await heads(p)) === '["Beta","AlphaX","Gamma"]', JSON.stringify(await heads(p)));
	await box(p, 'AlphaX').locator('h2').click(); await p.keyboard.press('End'); await p.keyboard.press('Backspace'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
	await box(p, 'Alpha').getByRole('button', { name: 'Fold the section' }).click(); await p.waitForTimeout(300);
	check('fold: the tasks are hidden', (await box(p, 'Alpha').locator('.row').count()) === 0);
	await p.reload(); await p.waitForTimeout(4000);
	check('the order and the fold are kept after reloading', JSON.stringify(await heads(p)) === '["Beta","Alpha","Gamma"]' && (await box(p, 'Alpha').locator('.row').count()) === 0, JSON.stringify(await heads(p)));
	await box(p, 'Alpha').getByRole('button', { name: 'Unfold the section' }).click(); await p.waitForTimeout(300);
	check('unfold: the tasks are back', (await box(p, 'Alpha').locator('.row').count()) === 2);
	await p.waitForTimeout(5000); // the sections reach the account
	{ const u = await req('GET', '/api/v1/user'); const m = u?.settings?.frontend_settings?.tasks_sections ?? {}; check('the sections reached the account', !!m[String(P.id)] && m[String(P.id)].s.length === 3, JSON.stringify(m[String(P.id)] ?? Object.keys(m))); }
	await ctx.close();
}
{
	const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	for (let k = 0; k < 4 && (await heads(p)).length < 3; k++) { await p.waitForTimeout(3000); if (k === 1) { await p.reload(); await p.waitForTimeout(5000); } }
	check('phone: the sections are there with their handle', JSON.stringify(await heads(p)) === '["Beta","Alpha","Gamma"]' && (await p.locator('.grip').count()) === 3, JSON.stringify(await heads(p)));
	// A finger drag (touch pointer events) on the handle.
	const g = await box(p, 'Gamma').locator('.grip').boundingBox(); const h = await box(p, 'Beta').locator('.section-header').boundingBox();
	const cdp = await ctx.newCDPSession(p);
	const pt = (y) => [{ x: g.x + g.width / 2, y }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(g.y + g.height / 2) });
	for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(g.y + g.height / 2 + ((h.y + 4 - g.y - g.height / 2) * k) / 8) });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(800);
	check('phone: a finger drag on the handle moves the section', JSON.stringify(await heads(p)) === '["Gamma","Beta","Alpha"]', JSON.stringify(await heads(p)));
	if (shots) await p.screenshot({ path: `${shots}/project-phone.png` });
	{
		const vw = 390; const bb = await p.getByRole('button', { name: 'Project actions' }).boundingBox();
		check('phone: + and ⋯ of the project are on the screen', !!bb && bb.x + bb.width <= vw && bb.x > 200, JSON.stringify(bb));
		await p.getByRole('button', { name: 'Project actions' }).click(); await p.waitForTimeout(300);
		await p.getByRole('button', { name: 'Mark pending' }).click(); await p.waitForTimeout(800);
		check('phone: ⋯ › Mark pending works', (await p.locator('.meta').innerText()).includes('pending project'), await p.locator('.meta').innerText());
		await p.getByRole('button', { name: 'Project actions' }).click(); await p.waitForTimeout(300);
		await p.getByRole('button', { name: 'Unmark pending' }).click(); await p.waitForTimeout(800);
		check('phone: ⋯ › Unmark pending works', (await p.locator('.meta').count()) === 0);
	}
	await ctx.close();
}
await browser.close();
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
