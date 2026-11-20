// The unified layout of 10 Nov 2026: one menu for every place, the top bar for what works
// everywhere, the Help centre (?) in four tabs with a searchable Updates tab. TEST Vikunja only.
// Usage: node e2e/layout.mjs <app> <api> <user> <pass> [stateDir]
import { chromium } from 'playwright-core';
import { writeFileSync, rmSync } from 'node:fs';
const [base, api, user, pass, stateDir = '/tmp/claude-0/t/state'] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
let ok = 0, n = 0;
const check = (name, cond, got = '') => { n++; if (cond) ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + String(got).slice(0, 400)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (opts, extra = {}) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j, x]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, [api, jwt, extra]);
	const p = await ctx.newPage();
	const errors = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p, errors };
};
const tabName = async (p) => (await p.locator('[role=tab][aria-selected=true]').innerText().catch(() => '')).replace(/\s+/g, '');

// ---------- Computer ----------
{
	const { ctx, p, errors } = await open({ viewport: { width: 1400, height: 900 } }, { news_seen: '2026-11-06' });
	check('one menu button, no right panel', (await p.getByRole('button', { name: /^Menu/ }).count()) === 1 && (await p.locator('aside.side').count()) === 1 && (await p.getByRole('button', { name: 'Toggle filters and labels panel' }).count()) === 0);
	const places = await p.locator('.places a').allInnerTexts();
	check('the menu starts with the pages, named', places.map((t) => t.replace(/🛒/, '').replace(/\d+$/, '').trim()).join('|') === 'Inbox|Shopping|Upcoming|Tomorrow|Weekly review|Bin', JSON.stringify(places));
	const heads = await p.locator('aside .fold h3').allInnerTexts();
	check('then Projects, Filters, Labels', heads.join('|') === 'Projects|Filters|Labels', JSON.stringify(heads));
	check('and the Bin with the pages (13 Nov 2026)', (await p.locator('aside .places a[href="/bin"]').count()) === 1);
	// Fold Labels: remembered after a reload
	await p.locator('aside .fold', { hasText: 'Labels' }).click(); await p.waitForTimeout(200);
	check('a heading folds its list', (await p.getByPlaceholder('Find a label').count()) === 0);
	await p.reload(); await p.waitForTimeout(4000);
	check('…and stays folded after a reload', (await p.getByPlaceholder('Find a label').count()) === 0);
	await p.locator('aside .fold', { hasText: 'Labels' }).click(); await p.waitForTimeout(200);
	check('…and unfolds', (await p.getByPlaceholder('Find a label').count()) === 1);
	await p.locator('.places a', { hasText: 'Weekly review' }).click(); await p.waitForTimeout(1500);
	check('a page of the menu opens and is marked', new URL(p.url()).pathname === '/weekly' && (await p.locator('.places a.active').innerText()).includes('Weekly'));

	// The ? button: a blue dot for updates not seen; the Help centre opens on Help
	check('? shows a dot for updates not seen yet', (await p.locator('.help-btn .badge.news').count()) === 1);
	await p.getByRole('button', { name: 'Help and settings' }).click(); await p.waitForTimeout(800);
	const tabs = await p.locator('[role=tab]').allInnerTexts();
	check('the Help centre has four tabs', tabs.map((t) => t.trim()).join('|') === 'Help|Updates|Status|Settings', JSON.stringify(tabs));
	check('it opens on Help', (await tabName(p)) === 'Help');
	check('Help explains how the app is organised', /Top bar[\s\S]*Menu[\s\S]*Help centre/.test(await p.locator('.map').innerText()));
	const guideHref = await p.getByRole('link', { name: 'Open the user guide' }).getAttribute('href');
	const g = await fetch(base + guideHref);
	check('the user guide opens from the app', g.status === 200 && (await g.text()).includes('<h2'), `${g.status} ${guideHref}`);
	await p.keyboard.press('ArrowRight').catch(() => {});
	await p.getByRole('tab', { name: 'Updates' }).click(); await p.waitForTimeout(500);
	const all = await p.locator('.updates .entry').count();
	check('Updates lists every update', all >= 10, all);
	check('the ones not seen yet are marked New', (await p.locator('.updates .new').count()) === 8, await p.locator('.updates .new').count()); // entries after 6 Nov (one per day)
	await p.getByLabel('Search the updates').fill('undo'); await p.waitForTimeout(300);
	const hits = await p.locator('.updates .entry').count();
	const marks = await p.locator('.updates mark').allInnerTexts();
	check('searching keeps only the updates that mention it', hits >= 2 && hits < all, hits);
	check('…with the word highlighted', marks.length >= 2 && marks.every((m) => m.toLowerCase() === 'undo'), JSON.stringify(marks));
	check('…and a count', /changes? in \d+ updates?/.test(await p.locator('.updates .count').innerText()));
	await p.getByLabel('Search the updates').fill('shopping phone filter heading'); await p.waitForTimeout(300);
	check('several words: every one must be mentioned', (await p.locator('.updates .entry').count()) === 1 && (await p.locator('.updates .entry h3').innerText()).includes('One clear layout'));
	await p.getByLabel('Search the updates').fill('zzzz'); await p.waitForTimeout(300);
	check('nothing found is said', (await p.locator('.updates .count').innerText()).includes('No update mentions that'));
	await p.getByRole('tab', { name: 'Settings' }).click(); await p.waitForTimeout(500);
	const sett = await p.locator('.settings-content').innerText();
	check('Settings: alerts, automations, my data, label colours, account', ['Alerts', 'Automations', 'My data', 'Label colours', 'Account', 'Sign out'].every((w) => sett.includes(w)), sett.slice(0, 300));
	check('…and nothing of Status there', !sett.includes('Run a health check'));
	await p.getByRole('tab', { name: 'Status' }).click(); await p.waitForTimeout(500);
	const stat = await p.locator('.settings-content').innerText();
	check('Status: server, sync, health check, error report', ['Server', 'Sync', 'Run a health check', 'Error report'].every((w) => stat.includes(w)), stat.slice(0, 300));
	await p.keyboard.press('Escape'); await p.waitForTimeout(400);
	check('seen: no more dot on ?', (await p.locator('.help-btn .badge').count()) === 0);

	// Keys
	await p.keyboard.press('g'); await p.keyboard.press('u'); await p.waitForTimeout(600);
	check('g u opens Updates', (await tabName(p)) === 'Updates');
	await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	await p.keyboard.press('g'); await p.keyboard.press('p'); await p.waitForTimeout(1000);
	check('g p opens Shopping', new URL(p.url()).pathname === '/shopping');
	// The page form of the Help centre
	await p.goto(base + '/settings?tab=updates'); await p.waitForTimeout(3000);
	check('/settings?tab=updates: the same tabs, as a page', (await tabName(p)) === 'Updates' && (await p.locator('main .updates').count()) === 1);
	await p.goto(base + '/settings'); await p.waitForTimeout(2000);
	check('/settings opens Settings', (await tabName(p)) === 'Settings');
	check('no error on the pages', errors.length === 0, errors.join(' | '));
	await ctx.close();
}

// ---------- The warning bar and the sync dot open Status ----------
{
	writeFileSync(`${stateDir}/health.json`, JSON.stringify({ generated: new Date().toISOString(), status: 'warn', checks: [{ name: 'Disk space', status: 'warn', detail: 'test only' }] }));
	const { ctx, p } = await open({ viewport: { width: 1280, height: 900 } }, { news_seen: '2099' });
	check('a warning: an orange dot on ?', (await p.locator('.help-btn .badge.warn').count()) === 1);
	await p.locator('.health-banner .link').click(); await p.waitForTimeout(800);
	check('the warning bar opens the Help centre on Status', (await tabName(p)).startsWith('Status') && (await p.locator('.issue', { hasText: 'Disk space' }).count()) === 1);
	await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	await p.locator('.sync-slot').click(); await p.waitForTimeout(600);
	check('the sync dot opens Status too', (await tabName(p)).startsWith('Status'));
	await ctx.close();
	rmSync(`${stateDir}/health.json`, { force: true });
}

// ---------- Phone ----------
{
	const { ctx, p, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { news_seen: '2099' });
	check('phone: the menu starts closed, no Shopping link on the home page', (await p.locator('aside.side').count()) === 0 && (await p.locator('.shop-link').count()) === 0);
	await p.getByRole('button', { name: /^Menu/ }).click(); await p.waitForTimeout(600);
	check('phone: the same menu (pages, projects, filters, labels, Bin)', (await p.locator('aside .places a').count()) === 6 && (await p.locator('aside .fold').count()) === 3 && (await p.locator('aside .places a[href="/bin"]').count()) === 1);
	await p.locator('aside .places a', { hasText: 'Shopping' }).click(); await p.waitForTimeout(1200);
	check('phone: a page opens and the menu closes', new URL(p.url()).pathname === '/shopping' && (await p.locator('aside.side').count()) === 0);
	await p.getByRole('button', { name: 'Help and settings' }).click(); await p.waitForTimeout(800);
	const box = await p.locator('[role=tablist]').boundingBox();
	check('phone: the four tabs fit the screen', box && box.width <= 390 && (await p.locator('[role=tab]').count()) === 4, JSON.stringify(box));
	check('phone: Help speaks of the round + button', (await p.locator('.map').innerText()).includes('round +'));
	check('phone: no error', errors.length === 0, errors.join(' | '));
	await ctx.close();
}

console.log(`\n${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
