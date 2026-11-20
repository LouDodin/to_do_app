// Selecting several tasks, redesigned 11 Nov 2026: a tick box on each row; while tasks are
// selected a click on a row only adds or removes it (nothing on the row reacts); easy to clear
// (Esc, ×, a click on an empty part of the page); a dark bar with Complete, Move, Labels, Due,
// More, Bin. Phone: "Select several tasks" in the long-press menu, then taps. TEST Vikunja only.
// Usage: node e2e/select.mjs <app> <api> <user> <pass>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const req = async (m, p, b) => (await fetch(api + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json().catch(() => null);
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const st = Date.now().toString(36).slice(-5);
const P = await req('PUT', '/api/v1/projects', { title: `Sel ${st}` });
const Q = await req('PUT', '/api/v1/projects', { title: `Sel other ${st}` });
const T = [];
for (const name of ['one', 'two', 'three', 'four']) { T.push(await req('PUT', `/api/v1/projects/${P.id}/tasks`, { title: `${name} ${st}` })); await wait(1100); }
let labels = []; for (let pg = 1; pg < 10; pg++) { const l = await req('GET', `/api/v1/labels?per_page=50&page=${pg}`); if (!l?.length) break; labels.push(...l); }
const L = labels.find((l) => !l.title.startsWith('ctx:') && l.title !== 'shopping');
const get = (id) => req('GET', `/api/v1/tasks/${id}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); localStorage.setItem('news_seen', '2099'); }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	await p.goto(`${base}/project/${P.id}`); await p.waitForTimeout(2500);
	return { ctx, p };
};

// ---------- Computer ----------
{
	const { ctx, p } = await open({ viewport: { width: 1300, height: 860 } });
	const row = (t) => p.locator('main .row', { hasText: `${t} ${st}` });
	const bar = p.locator('.bulk');
	const count = async () => (await bar.locator('.count').innerText().catch(() => '')).trim();
	const op = async (r) => r.locator('.pick').evaluate((e) => getComputedStyle(e).opacity);
	check('the tick box is hidden until the row is hovered', (await op(row('one'))) === '0');
	await row('one').hover(); await p.waitForTimeout(250);
	check('…and appears on hover', (await op(row('one'))) === '1');
	await row('one').locator('.pick').click(); await p.waitForTimeout(300);
	check('a click on the box selects the task (the page stays)', (await count()) === '1 selected' && new URL(p.url()).pathname === `/project/${P.id}`, await count());
	check('…and then every box is shown', (await op(row('four'))) === '1');
	// A click anywhere on another row adds it, without opening a picker
	await row('three').locator('.chip').first().click({ force: true }); await p.waitForTimeout(300);
	check('while selecting, a click on a row (even on its project) adds it, nothing opens', (await count()) === '2 selected' && (await p.locator('main .row .pop, main .popover').count()) === 0, await count());
	await row('three').locator('.title').click(); await p.waitForTimeout(250);
	check('a second click removes it', (await count()) === '1 selected' && !(await row('three').locator('.title textarea, .edit-input').count()));
	await p.keyboard.press('Escape'); await p.waitForTimeout(200);
	await row('one').hover(); await row('one').locator('.pick').click();
	await row('three').locator('.pick').click({ modifiers: ['Shift'] }); await p.waitForTimeout(300);
	check('Shift-click selects the range', (await count()) === '3 selected', await count());
	check('"Select all 4" is offered', (await bar.locator('.all').innerText().catch(() => '')).includes('4'));
	await bar.locator('.all').click(); await p.waitForTimeout(200);
	check('…and selects the whole list', (await count()) === '4 selected');
	await p.keyboard.press('Escape'); await p.waitForTimeout(200);
	check('Esc clears the selection', (await bar.count()) === 0);
	await row('one').locator('.pick').click(); await row('two').locator('.pick').click(); await p.waitForTimeout(200);
	await bar.getByRole('button', { name: 'Clear the selection' }).click(); await p.waitForTimeout(200);
	check('× clears it', (await bar.count()) === 0);
	await row('one').locator('.pick').click(); await p.waitForTimeout(200);
	const spot = await p.evaluate(() => { const m = document.querySelector('main').getBoundingClientRect(); return { x: m.right - 30, y: m.bottom - 30 }; });
	const what = await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, spot);
	await p.mouse.click(spot.x, spot.y); await p.waitForTimeout(200);
	check('a click on an empty part of the page clears it', (await bar.count()) === 0, what);
	await row('one').hover(); await row('one').locator('.title').click(); await p.waitForTimeout(400);
	check('with nothing selected, a click on a row works as before (no selection)', (await bar.count()) === 0);
	await p.keyboard.press('Escape');

	// The actions
	await row('one').hover(); await row('one').locator('.pick').click(); await row('two').click(); await p.waitForTimeout(300);
	const acts = await bar.locator('.act').allInnerTexts();
	check('the bar: Complete, Move, Labels, Due, Pending, Shopping, Inbox, Bin (no More menu)', acts.map((a) => a.trim()).join('|') === 'Complete|Move|Labels|Due|Pending|Shopping|Inbox|Bin', JSON.stringify(acts));
	check('the bar is white', (await bar.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(255, 255, 255)');
	// 11 Nov 2026: every action ends the selection
	const reselect = async () => { if ((await bar.count()) === 0) { await row('one').hover(); await row('one').locator('.pick').click(); await row('two').click(); await p.waitForTimeout(300); } };
	await bar.getByRole('button', { name: 'Labels' }).click(); await p.waitForTimeout(300);
	await p.locator('.bulk-pop').getByPlaceholder('Find a label…').fill(L.title);
	await p.locator('.bulk-pop .label-item', { hasText: L.title }).first().click(); await wait(3000);
	let both = await Promise.all([T[0].id, T[1].id].map(get));
	check(`Labels: "${L.title}" added to both, on the server`, both.every((t) => (t.labels ?? []).some((l) => l.id === L.id)), JSON.stringify(both.map((t) => t.labels?.map((l) => l.title))));
	check('…and the selection ends at once', (await bar.count()) === 0);
	await reselect();
	await bar.getByRole('button', { name: 'Labels' }).click(); await p.waitForTimeout(300);
	await p.locator('.bulk-pop').getByPlaceholder('Find a label…').fill(L.title);
	check('selected again: the label is ticked as on all of them', (await p.locator('.bulk-pop .label-item', { hasText: L.title }).first().getAttribute('aria-pressed')) === 'true');
	await p.locator('.bulk-pop .label-item', { hasText: L.title }).first().click(); await wait(3000);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('a click takes it off both', both.every((t) => !(t.labels ?? []).some((l) => l.id === L.id)));
	await reselect();
	await bar.getByRole('button', { name: 'Due' }).click(); await p.waitForTimeout(300);
	await p.locator('.bulk-pop').getByRole('button', { name: 'Tomorrow' }).click(); await wait(3000);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	const tomorrow = new Date(Date.now() + 864e5).toDateString();
	check('Due: tomorrow for both; the selection ends', both.every((t) => new Date(t.due_date).toDateString() === tomorrow) && (await bar.count()) === 0, JSON.stringify(both.map((t) => t.due_date)));
	await reselect();
	await bar.getByRole('button', { name: 'Pending' }).click(); await wait(3000);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('Pending: both on hold, in one click; the selection ends', both.every((t) => (t.labels ?? []).some((l) => l.title === 'ctx:pending')) && (await bar.count()) === 0);
	// Since 13 Nov 2026 pending tasks are hidden on the project page until shown.
	await p.locator('.tools').getByRole('button', { name: /^Pending/ }).click(); await wait(500);
	await reselect();
	check('selected again: the button says Resume', (await bar.getByRole('button', { name: 'Resume' }).count()) === 1);
	await bar.getByRole('button', { name: 'Resume' }).click(); await wait(2500);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('Resume: both back', both.every((t) => !(t.labels ?? []).some((l) => l.title === 'ctx:pending')));
	await p.locator('.tools').getByRole('button', { name: /^Pending/ }).click(); await wait(500);
	await reselect();
	await bar.getByRole('button', { name: 'Shopping' }).click(); await wait(3000);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('Shopping: both on the list, in one click; the selection ends', both.every((t) => (t.labels ?? []).some((l) => l.title === 'shopping')) && (await bar.count()) === 0);
	await p.keyboard.press('Control+z'); await wait(3000);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('…undone in one go', both.every((t) => !(t.labels ?? []).some((l) => l.title === 'shopping')), JSON.stringify(both.map((t) => [t.project_id, t.labels?.map((l) => l.title)])));
	await reselect();
	await bar.getByRole('button', { name: 'Move' }).click(); await p.waitForTimeout(300);
	await p.locator('.bulk-pop').getByPlaceholder('Search a project…').fill(`Sel other ${st}`);
	await p.locator('.bulk-pop .option', { hasText: `Sel other ${st}` }).click(); await wait(3500);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('Move: both in the other project; the selection ends', both.every((t) => t.project_id === Q.id) && (await bar.count()) === 0);
	await p.keyboard.press('Control+z'); await wait(3500);
	both = await Promise.all([T[0].id, T[1].id].map(get));
	check('one Ctrl+Z brings both back', both.every((t) => t.project_id === P.id));
	await p.waitForTimeout(1500);
	await row('three').hover(); await row('three').locator('.pick').click(); await row('four').click(); await p.waitForTimeout(300);
	let dialogs = 0; p.on('dialog', (d) => { dialogs++; d.accept(); });
	await bar.getByRole('button', { name: 'Bin' }).click(); await wait(3000);
	const binned = await Promise.all([T[2].id, T[3].id].map(get));
	check('Bin: no confirmation window, both in the Bin', dialogs === 0 && binned.every((t) => t.project_id !== P.id), JSON.stringify(binned.map((t) => t.project_id)));
	await p.keyboard.press('Control+z'); await wait(3500);
	check('…and Ctrl+Z restores them', (await Promise.all([T[2].id, T[3].id].map(get))).every((t) => t.project_id === P.id));
	await ctx.close();
}

// ---------- Phone ----------
{
	const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const row = (t) => p.locator('main .row', { hasText: `${t} ${st}` });
	const bar = p.locator('.bulk');
	check('phone: no tick boxes until selecting', (await p.locator('main .pick:visible').count()) === 0);
	await row('one').dispatchEvent('contextmenu'); await p.waitForTimeout(600);
	await p.getByRole('button', { name: /Select several tasks/ }).click(); await p.waitForTimeout(500);
	check('phone: "Select several tasks" in the long-press menu starts a selection', (await bar.locator('.count').innerText().catch(() => '')).trim() === '1 selected' && (await p.locator('main .pick:visible').count()) >= 4);
	await row('three').tap(); await p.waitForTimeout(400);
	check('phone: a tap adds a task (it does not open it)', (await bar.locator('.count').innerText()).trim() === '2 selected' && new URL(p.url()).pathname === `/project/${P.id}`);
	check('phone: the round + is hidden behind the bar', (await p.locator('.fab').count()) === 0);
	const box = await bar.boundingBox();
	check('phone: the bar spans the bottom', box && box.width > 360 && box.y + box.height <= 844, JSON.stringify(box));
	await bar.getByRole('button', { name: 'Clear the selection' }).tap(); await p.waitForTimeout(300);
	check('phone: × ends it, the + is back', (await bar.count()) === 0 && (await p.locator('.fab').count()) === 1);
	await row('two').tap(); await p.waitForTimeout(1500);
	check('phone: then a tap opens the task again', new URL(p.url()).pathname.startsWith('/task/'));
	await ctx.close();
}

console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
