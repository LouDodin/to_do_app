// The improvements of 19 Oct 2026, against a real Vikunja with a copy of the data.
// Usage: node e2e/oct19.mjs <appBase> <apiBase> <user> <password> [shotDir]
import { chromium } from 'playwright-core';
const [base, api, user, pass, shots] = process.argv.slice(2);
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const stamp = Date.now().toString(36);
const login = async (opts, view = 'all') => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j, v]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', v); localStorage.removeItem('inbox_order'); localStorage.removeItem('tasks_error_log'); } }, [api, jwt, view]);
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---------- Desktop ----------
{
	const { ctx, p } = await login({ viewport: { width: 1280, height: 900 } });
	// The menu (10 Nov 2026): the pages with their names, at the top; the Bin at the bottom
	const links = await p.locator('.places a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.textContent.trim()]));
	check('menu: Inbox, Shopping, Upcoming, Tomorrow, Weekly, Bin, in that order, with their names', links.map((l) => l[0]).join() === '/inbox,/shopping,/upcoming,/today-review,/weekly,/bin' && /Weekly review/.test(links[4][1]) && /Tomorrow/.test(links[3][1]), JSON.stringify(links));
	check('menu: the Bin under Weekly review', (await p.locator('.places a[href="/bin"]').count()) === 1);

	// New task: one box, goes to the Inbox
	await p.keyboard.press('n');
	const dlg = p.locator('[role=dialog][aria-label="New task"]');
	await dlg.waitFor();
	check('new task: just one text box', (await dlg.locator('input, textarea, select').count()) === 1, await dlg.locator('input, textarea, select').count());
	const t1 = `Oct19 first ${stamp}`, t2 = `Oct19 second ${stamp} tomorrow #p1`;
	await dlg.locator('input').fill(t1); await p.keyboard.press('Control+Enter');
	await p.waitForTimeout(600);
	check('new task: Ctrl+Enter keeps the box open', (await dlg.count()) === 1);
	await dlg.locator('input').fill(t2); await p.keyboard.press('Enter');
	await p.waitForTimeout(800);
	check('new task: Enter closes it', (await dlg.count()) === 0);
	check('new task: "Added to the Inbox"', (await p.locator('.toast').allTextContents()).some((t) => /Added to the Inbox/.test(t)));

	// Inbox page (13 Nov 2026: a page, no longer a view): newest first, switch
	await p.goto(base + '/inbox'); await p.waitForTimeout(4000);
	let rows = (await p.locator('.row .title').allTextContents()).map((s) => s.trim());
	check('inbox: newest first by default', rows[0] === t2 && rows[1] === t1, rows.slice(0, 3).join(' | '));
	check('inbox: the title is kept as typed (nothing parsed)', rows.includes(t2));
	await p.getByRole('button', { name: /Order:/ }).click(); await p.waitForTimeout(400);
	rows = (await p.locator('.row .title').allTextContents()).map((s) => s.trim());
	check('inbox: the button switches to oldest first', rows.at(-1) === t2 && rows.at(-2) === t1, rows.slice(-2).join(' | '));
	await p.reload(); await p.waitForTimeout(4000);
	rows = (await p.locator('.row .title').allTextContents()).map((s) => s.trim());
	check('inbox: the order is remembered', rows.at(-1) === t2, rows.at(-1));
	await p.getByRole('button', { name: /Order:/ }).click();

	// Same error twice: shown once, counted twice
	const circle = p.locator('.row', { hasText: t1 }).locator('.checkbox');
	await circle.click(); await p.waitForTimeout(300); await circle.click(); await p.waitForTimeout(300);
	const errToasts = await p.locator('.toast.error').count();
	check('errors: the same error is shown only once', errToasts === 1, errToasts);

	// Task page: validate bar, multi-line title, v shortcut
	await p.goto(base + '/'); await p.waitForTimeout(1500);
	const id = await p.evaluate((t) => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const g = r.result.transaction('tasks').objectStore('tasks').getAll(); g.onsuccess = () => res(g.result.find((x) => x.title === t)?.id); }; }), t1);
	await p.goto(`${base}/task/${id}`); await p.waitForTimeout(2500);
	check('task page: the title is a multi-line box', (await p.locator('textarea.title, .title-input, textarea').first().evaluate((e) => e.tagName)) === 'TEXTAREA');
	const bar = p.locator('.validate-bar');
	check('task page: "Validate definition" shown for an Inbox task', (await bar.count()) === 1);
	check('task page: disabled while it has no project', await bar.locator('button').isDisabled());
	if (shots) await p.screenshot({ path: `${shots}/oct19-task-validate.png` });

	// Shortcuts
	await p.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
	await p.keyboard.press('g'); await p.keyboard.press('w'); await p.waitForTimeout(1500);
	check('shortcut g w opens the Weekly review', p.url().endsWith('/weekly'), p.url());
	await p.keyboard.press('g'); await p.keyboard.press('t'); await p.waitForTimeout(1500);
	check('shortcut g t opens Tomorrow\'s priorities', p.url().endsWith('/today-review'), p.url());
	await p.keyboard.press('/'); await p.waitForTimeout(500);
	check('shortcut / opens the search', (await p.locator('[role=dialog][aria-label=Search]').count()) === 1);
	await p.keyboard.press('Escape');
	await p.keyboard.press('g'); await p.keyboard.press('s'); await p.waitForTimeout(1500);
	check('shortcut g s opens the Help centre on Settings', (await p.locator('[role=tab][aria-selected=true]').innerText().catch(() => '')) === 'Settings');
	await p.getByRole('tab', { name: 'Status' }).click(); await p.waitForTimeout(500);

	// Settings: errors history and About
	// (since 21 Oct: the errors go into the Error report, with a count per message)
	await p.getByRole('button', { name: 'Error report (30 days)' }).click();
	await p.locator('textarea.report').waitFor({ timeout: 20000 });
	const rep = await p.locator('textarea.report').inputValue();
	check('settings: the error is in the Error report, with its count', /×[0-9]+ [^\n]*choose a project/.test(rep), rep.slice(rep.indexOf('## Errors on the devices'), rep.indexOf('## Errors on the devices') + 400));
	const clip = await p.evaluate(() => navigator.clipboard.readText());
	check('settings: the Error report is copied for Claude', clip === rep);
	await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	check('settings: a "Run a health check" button', (await p.getByRole('button', { name: 'Run a health check' }).count()) === 1);
	await p.getByRole('tab', { name: 'Settings' }).click(); await p.waitForTimeout(400);
	check('settings: the build is shown under Account (no explanation text, 11 Nov 2026)', /Build /.test(await p.locator('.settings-content .foot').textContent()));
	check('settings: rare tools folded under Maintenance', (await p.locator('details.tools:not([open])').count()) === 1);

	// Reviews
	await p.goto(base + '/weekly'); await p.waitForTimeout(2500);
	// Redone 13 Nov 2026: no figures; Clean up (computer + Inbox), then the rest (see e2e/reviews.mjs)
	check('weekly: no figures, starts with Clean up', (await p.locator('.stat, .step .count').count()) === 0 && (await p.locator('.step > .head .title').first().innerText()).trim() === 'Clean up');
	const tidy = p.locator('[data-step="clean"]');
	check('weekly: Clean up: Desktop, Downloads and Emails to tick, and the Inbox', (await tidy.getByRole('checkbox').count()) === 4 && /Emails[\s\S]*Inbox/.test(await tidy.innerText()));
	// Start from a week with nothing ticked (an earlier run this week may have ticked them).
	for (const b of await tidy.getByRole('checkbox').all()) if ((await b.getAttribute('aria-checked')) === 'true') { await b.click(); await p.waitForTimeout(800); }
	if (await tidy.getByRole('button', { name: 'Step 1: not done' }).count()) { await tidy.getByRole('button', { name: 'Step 1: not done' }).click(); await p.waitForTimeout(800); }
	await tidy.getByRole('checkbox', { name: /Desktop/ }).click(); await p.waitForTimeout(1500);
	check('weekly: ticking Desktop', (await tidy.getByRole('checkbox', { name: /Desktop/ }).getAttribute('aria-checked')) === 'true');
	await p.evaluate(() => localStorage.removeItem('tasks_weekly_routine'));
	await p.reload(); await p.waitForTimeout(3000);
	check('weekly: the tick is kept in the account (seen after clearing the device)', (await p.locator('[data-step="clean"]').getByRole('checkbox', { name: /Desktop/ }).getAttribute('aria-checked')) === 'true');
	await p.locator('[data-step="clean"]').getByRole('checkbox', { name: /Downloads/ }).click(); await p.waitForTimeout(1500);
	await p.locator('[data-step="clean"]').getByRole('checkbox', { name: /Emails/ }).click(); await p.waitForTimeout(1500);
	// 11 Nov 2026: a step can be ticked by hand, even with things left in it (the Inbox here); kept in the account
	await p.locator('[data-step="clean"]').getByRole('button', { name: 'Step 1: done for this week' }).click(); await p.waitForTimeout(1500);
	check('weekly: the number of a step ticks it by hand', (await p.locator('[data-step="clean"].clear').count()) === 1);
	await p.evaluate(() => localStorage.removeItem('tasks_weekly_routine'));
	await p.reload(); await p.waitForTimeout(3000);
	check('weekly: …still ticked after a reload, from the account', (await p.locator('[data-step="clean"].clear').count()) === 1);
	await p.locator('[data-step="clean"]').getByRole('button', { name: 'Step 1: not done' }).click(); await p.waitForTimeout(1200);
	check('weekly: …and unticked (the Inbox still has tasks)', (await p.locator('[data-step="clean"].clear').count()) === 0);
	check('weekly: no explanation under the step titles', (await p.locator('.step .hint, .review .intro:not(:empty)').count()) === 0 || (await p.locator('.step .hint').count()) === 0);
	if (shots) await p.screenshot({ path: `${shots}/oct19-weekly-desktop.png`, fullPage: true });
	await ctx.close();
}

// ---------- Phone ----------
{
	const { ctx, p } = await login({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	// New task from the + button, closed by the back gesture
	await p.locator('.fab').click(); await p.waitForTimeout(500);
	check('phone: + opens the New task box', (await p.locator('[role=dialog][aria-label="New task"]').count()) === 1);
	await p.goBack(); await p.waitForTimeout(700);
	check('phone: back closes the box and stays on the page', (await p.locator('[role=dialog][aria-label="New task"]').count()) === 0 && new URL(p.url()).pathname === '/', p.url());

	await p.goto(base + '/settings?tab=help'); await p.waitForTimeout(1500);
	check('phone settings: New task (the round + button), no keyboard list', /New task icon/.test(await p.locator('.settings-content').textContent()) && (await p.locator('.keys').count()) === 0);
	await p.goto(base + '/'); await p.waitForTimeout(2500);
	// Long press on a task: the menu
	const row = p.locator('section .row').last(); // a task of the Available block (the former "My filter" list is gone, 25 Oct)
	const title = (await row.locator('.title').textContent()).trim();
	await row.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
	const box = await row.boundingBox();
	const cdp = await ctx.newCDPSession(p);
	const pt = { x: box.x + box.width / 2, y: box.y + Math.min(20, box.height / 2) };
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
	await p.waitForTimeout(800);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await p.waitForTimeout(500);
	const sheet = p.locator('.modal', { has: p.locator('.sheet') });
	check('phone: a long press opens the task menu', (await sheet.count()) === 1, title);
	check('phone: the long press did not open the task page', new URL(p.url()).pathname === '/', p.url());
	const items = (await sheet.locator('.item > span:first-child').allTextContents()).join(',');
	check('phone: menu has Select several, Project, Labels, Due date, Start date, Open, Bin', items === 'Select several tasks,Project,Labels,Due date,Start date,Open the task,Abandon,Move to the Bin', items);
	if (shots) await p.screenshot({ path: `${shots}/oct19-phone-sheet.png` });
	await p.goBack(); await p.waitForTimeout(600);
	check('phone: back closes the menu', (await sheet.count()) === 0 && new URL(p.url()).pathname === '/');
	// Due tomorrow from the menu
	await row.dispatchEvent('contextmenu'); await p.waitForTimeout(400);
	await sheet.getByRole('button', { name: /Due date/ }).click();
	await sheet.getByRole('button', { name: 'Tomorrow' }).click(); await p.waitForTimeout(800);
	check('phone: the menu closes after choosing a date', (await sheet.count()) === 0);
	// Tomorrow's priorities: it is due by tomorrow, Pick puts it on the list
	await p.goto(base + '/today-review'); await p.waitForTimeout(2500);
	const due = p.locator('[data-step="consider"]');
	check('tomorrow: the task is among the tasks to consider (Due by tomorrow)', (await due.locator('.row', { hasText: title }).count()) === 1, title);
	await due.locator('.slot', { hasText: title }).getByRole('button', { name: "Add it to tomorrow's list", exact: true }).click(); await p.waitForTimeout(1200);
	// It goes to Your list for tomorrow, or stays starred in "Planned for today, not done" if it was on today's list.
	const picked = p.locator('.review .slot', { hasText: title }).filter({ has: p.locator('.choose.on') });
	check('tomorrow: Pick puts it on the list for tomorrow (★)', (await picked.count()) === 1, await p.locator('.review').innerText());
	check('tomorrow: no sideways scrolling on the phone', (await overflow(p)) <= 1, await overflow(p));
	if (shots) await p.screenshot({ path: `${shots}/oct19-tomorrow-phone.png`, fullPage: true });
	await picked.getByRole('button', { name: "Take it off tomorrow's list", exact: true }).click(); await p.waitForTimeout(1000);
	check('tomorrow: Remove takes it off the list', (await p.locator('[data-step="chosen"] .row', { hasText: title }).count()) === 0 && (await p.locator('.review .slot', { hasText: title }).filter({ has: p.locator('.choose.on') }).count()) === 0);
	await p.goto(base + '/weekly'); await p.waitForTimeout(2500);
	check('weekly: no sideways scrolling on the phone', (await overflow(p)) <= 1, await overflow(p));
	if (shots) await p.screenshot({ path: `${shots}/oct19-weekly-phone.png`, fullPage: true });
	await ctx.close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
