// 22 Oct 2026: deleting from a task page goes back to where you were; "Got it" on a server warning
// acknowledges it for every device.
// Usage: node e2e/oct22.mjs <appBase> <apiBase> <user> <password> <stateDir of the app server>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base, api, user, pass, stateDir] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS ' : 'FAIL ', name, cond ? '' : '→ ' + String(got).slice(0, 300)); };
const login = async (opts = { viewport: { width: 1280, height: 900 } }) => {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); } }, [api, jwt]);
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	return { ctx, p };
};
const stamp = Date.now().toString(36);

// ---------- delete from the task page ----------
{
	const projects = await (await fetch(`${api}/api/v1/projects`, { headers: H })).json();
	const proj = projects.find((x) => x.id > 0 && !x.is_archived && !/inbox|bin/i.test(x.title));
	const mk = async (t) => (await (await fetch(`${api}/api/v1/projects/${proj.id}/tasks`, { method: 'PUT', headers: H, body: JSON.stringify({ title: t }) })).json()).id;
	const id1 = await mk('del-back-1 ' + stamp), id2 = await mk('del-back-2 ' + stamp);
	const { ctx, p } = await login();
	await p.goto(`${base}/project/${proj.id}`); await p.waitForTimeout(3000);
	await p.locator('.row', { hasText: 'del-back-1 ' + stamp }).locator('.title').first().dblclick().catch(() => {});
	await p.waitForTimeout(800);
	if (!p.url().includes('/task/')) { await p.evaluate((id) => { history.pushState({}, '', '/task/' + id); }, id1); await p.goto(`${base}/project/${proj.id}`); await p.waitForTimeout(1500); await p.evaluate(() => {}); }
	// open the task the way the app does: a link inside the app
	if (!p.url().includes('/task/')) { await p.evaluate((id) => { const a = document.createElement('a'); a.href = '/task/' + id; document.body.appendChild(a); a.click(); }, id1); await p.waitForTimeout(1500); }
	check('the task page is open', p.url().endsWith('/task/' + id1), p.url());
	await p.getByRole('button', { name: /delete/i }).first().click(); await p.waitForTimeout(1500);
	check('deleting goes back to the project page it came from', p.url().endsWith(`/project/${proj.id}`), p.url());
	// opened directly (a link from outside, a reload): back to home
	await p.goto(`${base}/task/${id2}`); await p.waitForTimeout(3000);
	await p.getByRole('button', { name: /delete/i }).first().click(); await p.waitForTimeout(1500);
	check('opened directly: deleting goes to the home page', new URL(p.url()).pathname === '/', p.url());
	await ctx.close();
}

// ---------- add a task inside a project ----------
{
	const projects = await (await fetch(`${api}/api/v1/projects`, { headers: H })).json();
	const proj = projects.find((x) => x.id > 0 && !x.is_archived && !/inbox|bin/i.test(x.title));
	const { ctx, p } = await login();
	await p.goto(`${base}/project/${proj.id}`); await p.waitForTimeout(3000);
	const box = p.getByRole('textbox', { name: 'Add a task to this project' });
	check('a project page has an "Add a task" box', (await box.count()) === 1);
	const t1 = 'In-project-1 ' + stamp, t2 = 'In-project-2 ' + stamp; // titles start with a capital (6 Nov 2026)
	await box.fill(t1); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
	check('the box empties and keeps the focus for the next one', (await box.inputValue()) === '' && (await box.evaluate((e) => e === document.activeElement)));
	await box.fill(t2); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
	const first = p.locator('main section').first();
	const titles = async () => (await first.locator('.row .title').allTextContents()).map((x) => x.trim());
	let list = await titles();
	check('they appear at the bottom of the list, in order', list.at(-2) === t1 && list.at(-1) === t2, list.slice(-3).join(' | '));
	await p.waitForTimeout(4000); // sent to the server, real ids
	list = await titles();
	check('and stay there once sent', list.at(-2) === t1 && list.at(-1) === t2, list.slice(-3).join(' | '));
	let srv;
	for (let i = 0; i < 20; i++) {
		const all = await (await fetch(`${api}/api/v1/tasks?per_page=200&s=${encodeURIComponent('In-project-1 ' + stamp)}`, { headers: H })).json();
		srv = all.find((t) => t.title === t1);
		if ((srv?.labels || []).length) break;
		await p.waitForTimeout(1000);
	}
	console.log('   queue:', await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('vikunja-frontend'); r.onsuccess = () => { const g = r.result.transaction('queue').objectStore('queue').getAll(); g.onsuccess = () => res(JSON.stringify(g.result.map((q) => [q.op, q.targetId, q.entity, q.attempts, q.lastError]))); }; })));
	check('created in this project on the server', srv?.project_id === proj.id, JSON.stringify(srv?.project_id));
	check('validated at once (not sent to the Inbox)', (srv?.labels || []).some((l) => l.title === 'ctx:validated'), JSON.stringify((srv?.labels || []).map((l) => l.title)));
	const row = first.locator('.row', { hasText: t1 });
	check('its row has the same controls as in the Inbox (labels, project, date)', (await row.locator('.col-project').count()) === 1 && (await row.locator('.col-date').count()) === 2, await row.innerHTML());
	await p.goto(base + '/inbox'); await p.waitForTimeout(4000);
	check('not in the Inbox', (await p.locator('.row', { hasText: t1 }).count()) === 0);
	await ctx.close();
}

// ---------- acknowledge a warning ----------
{
	const now = new Date().toISOString();
	const report = { generated: now, status: 'warn', checks: [
		{ name: 'Vikunja server', status: 'ok', detail: 'version v2.7.1', fix: '' },
		{ name: 'Interruptions', status: 'warn', detail: 'the PC was asleep or off from Wed 21 Oct 19:07 to Wed 21 Oct 22:03 (3 h): no device could sync then', fix: 'Nothing if you know why.' },
		{ name: 'Sign-ups', status: 'fail', detail: 'open', fix: 'Run scripts\\repair-services.bat.' }
	] };
	fs.mkdirSync(stateDir, { recursive: true });
	fs.writeFileSync(`${stateDir}/health.json`, JSON.stringify(report));
	fs.rmSync(`${stateDir}/acknowledged.json`, { force: true }); fs.rmSync(`${stateDir}/acknowledged-users.json`, { force: true });
	const pc = await login(), phone = await login({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
	await pc.p.goto(base + '/settings?tab=status'); await pc.p.waitForTimeout(2500);
	const warn = pc.p.locator('.issue', { hasText: 'Interruptions' });
	check('the warning has a "Got it" button', (await warn.getByRole('button', { name: 'Got it' }).count()) === 1);
	check('a problem (not a warning) has none', (await pc.p.locator('.issue', { hasText: 'Sign-ups' }).getByRole('button', { name: 'Got it' }).count()) === 0);
	await warn.getByRole('button', { name: 'Got it' }).click(); await pc.p.waitForTimeout(2500);
	check('the warning is gone from the list', (await pc.p.locator('.issue', { hasText: 'Interruptions' }).count()) === 0);
	check('it is listed as acknowledged', /Acknowledged: Interruptions/.test(await pc.p.locator('.acked').textContent().catch(() => '')));
	// 30 Oct 2026: someone who is not the admin hides it for themselves only (tools/acks.py).
	const h = JSON.parse(fs.readFileSync(`${stateDir}/health.json`, 'utf8'));
	check('the shared report is unchanged (for the others it is still a warning)', h.checks.find((c) => c.name === 'Interruptions').status === 'warn', JSON.stringify(h));
	const a = JSON.parse(fs.readFileSync(`${stateDir}/acknowledged-users.json`, 'utf8'));
	check('kept on the PC for this person', Object.values(a).some((x) => x.Interruptions?.detail?.includes('19:07')), JSON.stringify(a));
	await phone.p.goto(base + '/settings?tab=status'); await phone.p.waitForTimeout(2500);
	check('their other device does not show it either', (await phone.p.locator('.issue', { hasText: 'Interruptions' }).count()) === 0 && (await phone.p.locator('.issue', { hasText: 'Sign-ups' }).count()) === 1);
	const r0 = await fetch(base + '/ack-warning', { method: 'POST', body: JSON.stringify({ name: 'Interruptions', scope: 'everyone' }), headers: H });
	check('"for everyone" is refused to someone who is not the admin', r0.status === 403 || r0.status === 409, r0.status);
	const r = await fetch(base + '/ack-warning', { method: 'POST', body: JSON.stringify({ name: 'Sign-ups' }), headers: { 'Content-Type': 'application/json' } });
	check('refused without signing in', r.status === 401, r.status);
	const r2 = await fetch(base + '/ack-warning', { method: 'POST', body: JSON.stringify({ name: 'Sign-ups' }), headers: H });
	check('a problem cannot be acknowledged', r2.status === 409, r2.status);
	for (const f of ['health.json', 'acknowledged.json', 'acknowledged-users.json']) fs.rmSync(`${stateDir}/${f}`, { force: true });
}
console.log(`${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
