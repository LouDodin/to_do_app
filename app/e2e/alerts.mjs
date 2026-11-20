// Alerts to the ntfy topic: signed out by the server, sync stuck 15 min, manual sign-out
// (no alert), topic saved in the account and picked up by another device.
// Usage: node e2e/alerts.mjs <appBase> <apiBase> <username> <password>
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--host-resolver-rules=MAP tasks.test 127.0.0.1'] });
const login = async () => (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;

// Devices other than the PC: the app is reached by another name than 127.0.0.1/localhost.
const remote = base.replace('localhost', 'tasks.test').replace('127.0.0.1', 'tasks.test');
async function ctxWith(init, opts = {}, args) {
	const ctx = await browser.newContext(opts);
	const sent = [];
	await ctx.route('https://ntfy.sh/**', (route) => {
		const r = route.request();
		sent.push({ url: r.url(), body: r.postData() });
		route.fulfill({ status: 200, body: '{}' });
	});
	if (args) await ctx.addInitScript(init, args); else await ctx.addInitScript(init);
	return { ctx, sent };
}

// 1. Signed out by the server: a token the server refuses
{
	const { ctx, sent } = await ctxWith(([a]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.x'); localStorage.setItem('tasks_alert_topic', 'topic-test'); }, { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }, [api]);
	const p = await ctx.newPage();
	await p.goto(remote + '/'); await p.waitForTimeout(8000);
	check('signed out by the server: one alert', sent.length === 1, JSON.stringify(sent));
	const u = sent[0] ? new URL(sent[0].url) : null;
	check('  to the topic, tagged warning + phone', u && u.pathname === '/topic-test' && u.searchParams.get('tags') === 'warning,phone', sent[0]?.url);
	check('  generic text', sent[0]?.body?.includes('signed out of Tasks') && !/topic|ts\.net|127\.0/.test(sent[0].body), sent[0]?.body);
	await p.reload(); await p.waitForTimeout(7000);
	check('  not repeated after a reload', sent.length === 1, sent.length);
	await ctx.close();
}
// 2. Sync stuck: server unreachable, failing for 16 min already
{
	const { ctx, sent } = await ctxWith(() => { localStorage.setItem('vikunja_api_url', 'http://127.0.0.1:9'); localStorage.setItem('vikunja_jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.x'); localStorage.setItem('tasks_alert_topic', 'topic-test'); localStorage.setItem('tasks_sync_failing_since', String(Date.now() - 16 * 60 * 1000)); }, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
	const p = await ctx.newPage();
	await p.goto(remote + '/'); await p.waitForTimeout(8000);
	check('sync stuck for 15 min: one alert', sent.length === 1 && sent[0].body.includes('not synced for 15 minutes'), JSON.stringify(sent));
	check('  tagged mac', sent[0] && new URL(sent[0].url).searchParams.get('tags') === 'warning,mac', sent[0]?.url);
	await ctx.close();
}
// 3. Stuck for less than 15 min: nothing
{
	const { ctx, sent } = await ctxWith(() => { localStorage.setItem('vikunja_api_url', 'http://127.0.0.1:9'); localStorage.setItem('vikunja_jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.x'); localStorage.setItem('tasks_alert_topic', 'topic-test'); });
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(8000);
	check('server unreachable for a few seconds: no alert', sent.length === 0, JSON.stringify(sent));
	await ctx.close();
}
// 4. Real account: save the topic on one device, another device picks it up; manual sign-out sends nothing
{
	const jwt = await login();
	const init = ([a, j]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); sessionStorage.setItem('seeded', '1'); } };
	const one = await ctxWith(init); await one.ctx.addInitScript(init, [api, jwt]);
	const p = await one.ctx.newPage();
	await p.goto(base + '/settings'); await p.waitForTimeout(3000);
	await p.getByPlaceholder('ntfy topic').fill('tasks-e2e-topic');
	await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(1500);
	const me = await (await fetch(api + '/api/v1/user', { headers: { Authorization: 'Bearer ' + jwt } })).json();
	check('topic saved in the account', me.settings.frontend_settings.tasks_alert_topic === 'tasks-e2e-topic', JSON.stringify(me.settings.frontend_settings).slice(0, 200));
	check('  other account settings kept', me.settings.frontend_settings.play_sound_when_done !== undefined && me.settings.name === 'Lou', me.settings.name);
	await p.getByRole('button', { name: 'Test', exact: true }).click(); await p.waitForTimeout(1000);
	check('test alert sent', one.sent.some((s) => s.url.includes('/tasks-e2e-topic') && new URL(s.url).searchParams.get('tags').startsWith('white_check_mark,test')), JSON.stringify(one.sent));
	await p.getByRole('button', { name: 'Sign out' }).click(); await p.waitForTimeout(7000);
	check('manual sign-out: no alert', one.sent.length === 1, JSON.stringify(one.sent));
	const two = await ctxWith(init); await two.ctx.addInitScript(init, [api, await login()]);
	const q = await two.ctx.newPage();
	await q.goto(base + '/settings'); await q.waitForTimeout(4000);
	check('another device picks the topic up from the account', (await q.getByPlaceholder('ntfy topic').inputValue()) === 'tasks-e2e-topic');
	await q.getByPlaceholder('ntfy topic').fill(''); await q.getByRole('button', { name: 'Save' }).click(); await q.waitForTimeout(1500);
	await one.ctx.close(); await two.ctx.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
