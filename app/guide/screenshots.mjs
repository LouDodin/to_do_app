// Screenshots for the user guide (demo account Alex on the test server). Not a test.
// Usage: node e2e/_guide-shots.mjs <app> <api> <outDir>
import { chromium } from 'playwright-core';
const [base, api, out] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Alex', password: 'local-test-only-456' }) })).json()).token;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctxFor = async (o, view = 'all') => {
	const c = await b.newContext({ ...o, serviceWorkers: 'block' });
	await c.addInitScript(([a, j, v]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', v); localStorage.setItem('my_data_since', String(Date.now())); localStorage.setItem('news_seen', '2099'); } }, [api, jwt, view]);
	return c;
};
const wait = (p, ms) => p.waitForTimeout(ms);
const shot = (p, name, clip) => p.screenshot({ path: `${out}/${name}.png`, ...(clip ? { clip } : {}) });

// ---- computer
{
	const c = await ctxFor({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
	const p = await c.newPage();
	await p.goto(base + '/'); await wait(p, 7000);
	await p.reload(); await wait(p, 4000); // after the first sync and the account's first-time set-up
	await shot(p, 'desk-home');
	// All / Pro / Perso, top left (14 Nov 2026: written side by side, no menu)
	await shot(p, 'desk-views', { x: 0, y: 0, width: 420, height: 60 });
	// filter box
	const box = p.getByRole('textbox', { name: 'Filter tasks' });
	await box.click(); await box.pressSequentially('call', { delay: 40 }); await wait(p, 600);
	await shot(p, 'desk-filter', { x: 250, y: 50, width: 780, height: 420 });
	await p.getByRole('button', { name: 'Clear the filter' }).click(); await wait(p, 300);
	// Inbox page
	await p.goto(base + '/inbox'); await wait(p, 2500);
	await shot(p, 'desk-inbox', { x: 250, y: 50, width: 1030, height: 300 });
	// new task window
	await p.keyboard.press('n'); await wait(p, 500);
	await p.keyboard.type('Pay the electricity bill', { delay: 20 }); await wait(p, 300);
	await shot(p, 'desk-newtask', { x: 240, y: 0, width: 800, height: 380 });
	await p.keyboard.press('Escape'); await wait(p, 300);
	// task page
	const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
	const all = await (await fetch(api + '/api/v1/tasks?per_page=50', { headers: H })).json();
	const tid = all.find((t) => t.title === 'Cancel the internet contract').id;
	await p.evaluate(() => localStorage.setItem('view', 'all'));
	await p.goto(base + '/task/' + tid); await wait(p, 2000);
	{ const r = await p.locator('.task-page').boundingBox(); await shot(p, 'desk-task', { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 20), width: r.width + 60, height: r.height + 40 }); }
	// project page
	const projs = await (await fetch(api + '/api/v1/projects', { headers: H })).json();
	await p.goto(base + '/project/' + projs.find((x) => x.title === 'HOME').id); await wait(p, 2000);
	await shot(p, 'desk-project', { x: 250, y: 0, width: 1030, height: 700 });
	// several tasks selected, with the bar and its Labels menu
	await p.goto(base + '/'); await wait(p, 2000);
	{ const rows = p.locator('main .row'); await rows.nth(0).hover(); await rows.nth(0).locator('.pick').click(); await rows.nth(2).click(); await wait(p, 300);
	  await p.locator('.bulk').getByRole('button', { name: 'Labels' }).click(); await wait(p, 400);
	  await shot(p, 'desk-select', { x: 110, y: 120, width: 1170, height: 680 });
	  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); }
	// reviews
	await p.goto(base + '/weekly'); await wait(p, 1800);
	await shot(p, 'desk-weekly');
	await p.goto(base + '/today-review'); await wait(p, 1800);
	await shot(p, 'desk-tomorrow');
	// Upcoming (13 Nov 2026): a few tasks planned for the coming days, and the week's list
	{
		const day = (d, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
		const home = projs.find((x) => x.title === 'HOME').id, work = projs.find((x) => x.title === 'WORK').id;
		const mkT = async (pid, title, o) => (await (await fetch(api + `/api/v1/projects/${pid}/tasks`, { method: 'PUT', headers: H, body: JSON.stringify({ title, ...o }) })).json());
		let ls = []; for (let pg = 1; pg < 10; pg++) { const l = await (await fetch(api + `/api/v1/labels?per_page=50&page=${pg}`, { headers: H })).json(); if (!l?.length) break; ls = ls.concat(l); }
		let week = ls.find((l) => l.title === 'week'); if (!week) week = await (await fetch(api + '/api/v1/labels', { method: 'PUT', headers: H, body: JSON.stringify({ title: 'week', hex_color: '1e88e5' }) })).json();
		const validated = ls.find((l) => l.title === 'ctx:validated');
		const lab = async (t, l) => l && fetch(api + `/api/v1/tasks/${t.id}/labels`, { method: 'PUT', headers: H, body: JSON.stringify({ label_id: l.id }) });
		const a = await mkT(home, 'Water the plants on the balcony', { start_date: day(1) });
		const b2 = await mkT(work, 'Draft the agenda for Monday', { start_date: day(2, 14) });
		const c2 = await mkT(home, 'Pay the electricity bill', { start_date: day(-3), due_date: day(3, 20) });
		const d2 = await mkT(work, 'Read the quarterly figures', { start_date: day(-3) });
		for (const t of [a, b2, c2, d2]) await lab(t, validated);
		await lab(b2, week); await lab(d2, week);
		await p.goto(base + '/'); await wait(p, 6000);
		await p.goto(base + '/upcoming'); await wait(p, 2000);
		await shot(p, 'desk-upcoming', { x: 250, y: 0, width: 1030, height: 800 });
	}
	// help
	await p.goto(base + '/'); await wait(p, 1500);
	await p.getByRole('button', { name: 'Help and settings' }).click(); await wait(p, 1500);
	await shot(p, 'desk-help');
	await p.getByRole('tab', { name: 'Updates' }).click(); await wait(p, 500);
	await p.getByLabel('Search the updates').fill('phone'); await p.keyboard.press('Tab'); await wait(p, 500);
	await shot(p, 'desk-help2');
	await c.close();
}
// ---- phone
{
	const c = await ctxFor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	const p = await c.newPage();
	await p.goto(base + '/'); await wait(p, 6000);
	await shot(p, 'phone-home');
	// long press on a task
	const row = p.locator('section .row').nth(2);
	const r = await row.boundingBox();
	const cdp = await c.newCDPSession(p);
	const pt = { x: r.x + r.width / 2, y: r.y + Math.min(20, r.height / 2) };
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] }); await wait(p, 800);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(p, 700);
	await shot(p, 'phone-menu');
	await p.keyboard.press('Escape'); await p.goBack().catch(() => {}); await wait(p, 600);
	await p.goto(base + '/'); await wait(p, 2000);
	await p.locator('button', { hasText: '☰' }).first().tap(); await wait(p, 700);
	await shot(p, 'phone-panel');
	await c.close();
}
await b.close();
console.log('shots done');
