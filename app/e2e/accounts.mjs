// Several accounts on one server (26 Oct 2026): automations switched on per account from the app,
// one poller per account working only on that account, per-account checks, and "Download my data".
// Needs: a test Vikunja with LouDodin (main) and Alex, the PC layout in <root> (app, tools,
// automations, state, vikunja/db/vikunja.db) served on <app> by tools/serve_app.py.
// Usage: node e2e/accounts.mjs <app> <api> <root>
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
const [base, api, root] = process.argv.slice(2);
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS ' : 'FAIL ', name, cond ? '' : '→ ' + String(got).slice(0, 1500)); };
const login = async (u, p) => (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token;
const lou = await login('LouDodin', 'local-test-only-123');
const alex = await login('Alex', 'local-test-only-456');
const H = (j) => ({ Authorization: 'Bearer ' + j, 'Content-Type': 'application/json' });
const get = async (j, path) => (await fetch(api + path, { headers: H(j) })).json();
const all = async (j, path) => { let out = [], p = 1; for (;;) { const b = await get(j, `${path}${path.includes('?') ? '&' : '?'}page=${p}&per_page=50`); if (!Array.isArray(b) || !b.length) break; out = out.concat(b); if (b.length < 50) break; p++; } return out; };

// The main account's automation token, as on the PC
const full = await (await fetch(api + '/api/v1/routes', { headers: H(lou) })).json();
const perms = Object.fromEntries(Object.entries(full).map(([k, v]) => [k, Object.keys(v)]));
const mainTok = await (await fetch(api + '/api/v1/tokens', { method: 'PUT', headers: H(lou), body: JSON.stringify({ title: 'main test', expires_at: '2099-01-01T00:00:00Z', permissions: perms }) })).json();
fs.mkdirSync(`${root}/state/automations`, { recursive: true });
fs.writeFileSync(`${root}/state/automation-token.txt`, mainTok.token);
fs.writeFileSync(`${root}/state/automations/enabled.txt`, 'on');

// Alex: a task overdue since yesterday, in his Inbox
const alexInbox = (await get(alex, '/api/v1/projects')).find((p) => /inbox/i.test(p.title));
const yesterday = new Date(Date.now() - 86400000).toISOString().replace(/\.\d+Z$/, 'Z');
const aTask = await (await fetch(`${api}/api/v1/projects/${alexInbox.id}/tasks`, { method: 'PUT', headers: H(alex), body: JSON.stringify({ title: 'Alex: renew passport', due_date: yesterday }) })).json();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (jwt) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
	await ctx.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); } }, [api, jwt]);
	const p = await ctx.newPage(); await p.goto(base + '/'); await p.waitForTimeout(5000);
	await p.goto(base + '/settings'); await p.waitForTimeout(2500);
	return { ctx, p };
};
const section = (p, h) => p.locator('section', { has: p.locator('h2', { hasText: h }) });

// 1. Lou: main account, on, managed on the PC
{
	const { ctx, p } = await open(lou);
	const t = await section(p, 'Automations').innerText();
	await p.waitForTimeout(3000); // let this session finish its own sync before taking Lou's snapshot
	check('main account: "On (main account, managed on the PC)", no switch', /On \(main account/.test(t) && (await section(p, 'Automations').getByRole('button').count()) === 0, t);
	await ctx.close();
}
const louLabelsBefore = (await all(lou, '/api/v1/labels')).length;
const louTasksBefore = JSON.stringify((await all(lou, '/api/v1/tasks')).map((t) => [t.id, t.due_date, (t.labels || []).map((l) => l.id).sort()]));
// 2. Alex: on by default (the app switches them on by itself), off on purpose is remembered
const { ctx, p } = await open(alex);
await p.waitForTimeout(16000); await p.reload(); await p.waitForTimeout(3000);
let t = await section(p, 'Automations').innerText();
check('on by default: a new account has them on without doing anything', /\bOn\b/.test(t) && (await section(p, 'Automations').getByRole('button', { name: 'Turn off' }).count()) === 1, t);
await section(p, 'Automations').getByRole('button', { name: 'Turn off' }).click(); await p.waitForTimeout(2500);
await p.reload(); await p.waitForTimeout(18000); await p.reload(); await p.waitForTimeout(3000);
t = await section(p, 'Automations').innerText();
check('switched off on purpose: they stay off (not switched on again by itself)', /\bOff\b/.test(t), t);
await section(p, 'Automations').getByRole('button', { name: 'Turn on' }).click(); await p.waitForTimeout(2500);
t = await section(p, 'Automations').innerText();
check('"Turn on" again: On', /\bOn\b/.test(t) && (await section(p, 'Automations').getByRole('button', { name: 'Turn off' }).count()) === 1, t);
const tokFile = `${root}/state/automations/users/Alex/api_token.txt`;
check('the PC keeps a token for Alex only', fs.existsSync(tokFile));
const alexTokens = await get(alex, '/api/v1/tokens');
check('one token with limited rights in Alex\'s account (the one switched off was deleted)', alexTokens.filter((x) => x.title === 'Tasks automations (PC)').length === 1 && alexTokens.every((x) => x.title !== 'Tasks automations (PC)' || !x.permissions.projects_shares), JSON.stringify(alexTokens.map((x) => x.title)));
// 3. Nobody can hand the PC someone else's token
const r = await fetch(base + '/automations', { method: 'POST', headers: H(alex), body: JSON.stringify({ on: true, token: mainTok.token }) });
check("the PC refuses another account's token", r.status === 403, r.status);
const r2 = await fetch(base + '/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) });
check('and anything without signing in', r2.status === 401, r2.status);
// 4. One cycle of Alex's poller
const env = { ...process.env, VIKUNJA_URL: api, AUTOMATION_ROLE: 'server', AUTOMATION_DIR: `${root}/automations`, AUTOMATION_STATE_DIR: `${root}/state/automations/users/Alex`, VIKUNJA_TOKEN_FILE: tokFile, AUTOMATION_LOG: `${root}/logs/automations-Alex.log` };
let out = '';
try { out = execFileSync('python3', ['-X', 'utf8', '-I', `${root}/automations/webhook_listener.py`, '--once'], { env, encoding: 'utf8' }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
check("Alex's poller runs a cycle without a problem (the token's rights are enough)", /^0 problem/m.test(out), out + fs.readFileSync(`${root}/logs/automations-Alex.log`, 'utf8').slice(-600));
const alexLabels = (await all(alex, '/api/v1/labels')).map((l) => l.title);
check('Alex gets his own next-action / today / overdue / last-day labels', ['next-action', 'today', 'overdue', 'last-day'].every((x) => alexLabels.includes(x)), JSON.stringify(alexLabels));
const aNow = await get(alex, `/api/v1/tasks/${aTask.id}`);
check("Alex's overdue task gets his 'overdue' label", (aNow.labels || []).some((l) => l.title === 'overdue'), JSON.stringify(aNow.labels));
check('and keeps its due date (the start-date fix of the same cycle no longer empties it)', aNow.due_date === aTask.due_date, aNow.due_date);
const louLabelsAfter = (await all(lou, '/api/v1/labels')).length;
check("Lou's labels untouched", louLabelsAfter === louLabelsBefore, `${louLabelsBefore} -> ${louLabelsAfter}`);
check("Lou's tasks untouched", JSON.stringify((await all(lou, '/api/v1/tasks')).map((t) => [t.id, t.due_date, (t.labels || []).map((l) => l.id).sort()])) === louTasksBefore);
// 5. The PC's supervisor runs a poller for each account
const sup = spawn('python3', ['-X', 'utf8', '-I', `${root}/automations/run_poller.py`], { env: { ...process.env, AUTOMATION_TEST_URL: api }, stdio: 'ignore' });
await new Promise((res) => setTimeout(res, 25000));
const beat = (f) => { try { return Date.now() - Date.parse(fs.readFileSync(f, 'utf8').trim()); } catch { return Infinity; } };
check('the supervisor runs your poller', beat(`${root}/state/automations/heartbeat.txt`) < 30000, beat(`${root}/state/automations/heartbeat.txt`));
check("and Alex's", beat(`${root}/state/automations/users/Alex/heartbeat.txt`) < 30000);
// 6. The health check sees both accounts, each checked on its own
const hc = execFileSync('python3', ['-I', '-c', `import sys; sys.argv=['x']; import importlib.util as u; s=u.spec_from_file_location('h','${root}/tools/healthcheck.py'); h=u.module_from_spec(s); s.loader.exec_module(h); h.check_automations(); print('\\n'.join(c['status']+' '+c['name']+': '+c['detail'] for c in h.checks))`], { encoding: 'utf8' });
check('health check: running for you and 1 other account', /ok Automations: running for you and 1 other account/.test(hc), hc);
const dataLine = (hc.match(/^\w+ Automation data checks: .*$/m) || [''])[0];
// (the test copy has an old saved filter of Lou's pointing at deleted labels: that one is real)
check("health check: Alex's data checked on its own, nothing flagged for him or across accounts (no duplicate labels from two accounts)", /data checks/.test(dataLine) && !/Automation data checks · Alex/.test(hc) && !/duplicate labels/.test(dataLine), dataLine);
// 7. Download my data (Alex): only Alex's tasks
const [dl] = await Promise.all([p.waitForEvent('download'), section(p, 'My data').getByRole('button', { name: 'Download a table (Excel)' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
check('download: a table with his task', /Alex: renew passport/.test(csv) && dl.suggestedFilename().endsWith('.csv'), dl.suggestedFilename());
check("download: nothing of Lou's", !/postcard/i.test(csv) && csv.trim().split('\r\n').length === 2, csv.slice(0, 300));
const [dl2] = await Promise.all([p.waitForEvent('download'), section(p, 'My data').getByRole('button', { name: 'Download everything' }).click()]);
const j = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
check('download: the complete copy has his tasks, projects and labels', j.counts.tasks === 1 && j.projects.length >= 1 && j.tasks[0].title === 'Alex: renew passport', JSON.stringify(j.counts));
check('and the date of the last copy is shown', /Last copy:/.test(await section(p, 'My data').innerText()));
// 8. Turn off
await section(p, 'Automations').getByRole('button', { name: 'Turn off' }).click(); await p.waitForTimeout(2500);
check('"Turn off": the PC drops his token', !fs.existsSync(tokFile));
check('and the token is deleted from his account', !(await get(alex, '/api/v1/tokens')).some((x) => x.title === 'Tasks automations (PC)'));
await new Promise((res) => setTimeout(res, 35000));
const alexBeat1 = beat(`${root}/state/automations/users/Alex/heartbeat.txt`);
check("and his poller has stopped (no new cycle)", alexBeat1 > 30000, alexBeat1);
sup.kill();
await ctx.close();
console.log(`${ok}/${n} passed`);
await browser.close();
process.exit(ok === n ? 0 : 1);
