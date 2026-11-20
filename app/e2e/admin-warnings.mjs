// Warnings of every account for the admin (30 Oct 2026): the main account (LouDodin) sees every
// account's warnings, with who each one concerns and which device caused it, and can say "Got it"
// for herself only or for everyone; Alex sees the server's warnings and his own only.
// Needs the multi-account sandbox (scratchpad/mu-setup.sh): <root> = the PC layout served on <app>.
// Usage: node e2e/admin-warnings.mjs <app> <api> <root>
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [base, api, root] = process.argv.slice(2);
const S = `${root}/state`;
let ok = 0, n = 0;
const check = (name, cond, got) => { n++; if (cond) ok++; console.log(cond ? 'PASS ' : 'FAIL ', name, cond ? '' : '→ ' + String(got).slice(0, 1200)); };
const login = async (u, p) => (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token;
const lou = await login('LouDodin', 'local-test-only-123');
const alex = await login('Alex', 'local-test-only-456');
const H = (j) => ({ Authorization: 'Bearer ' + j, 'Content-Type': 'application/json' });

// LouDodin is the main account (the automation token is hers), as on the PC
if (!fs.existsSync(`${S}/automation-token.txt`)) {
	const full = await (await fetch(api + '/api/v1/routes', { headers: H(lou) })).json();
	const perms = Object.fromEntries(Object.entries(full).map(([k, v]) => [k, Object.keys(v)]));
	const t = await (await fetch(api + '/api/v1/tokens', { method: 'PUT', headers: H(lou), body: JSON.stringify({ title: 'main test', expires_at: '2099-01-01T00:00:00Z', permissions: perms }) })).json();
	fs.mkdirSync(S, { recursive: true });
	fs.writeFileSync(`${S}/automation-token.txt`, t.token);
}
for (const f of ['acknowledged.json', 'acknowledged-users.json', 'client-log.jsonl', 'devices.json']) fs.rmSync(`${S}/${f}`, { force: true });

// 1. Devices report to the PC: the account is recorded with each device
const post = (j, device) => fetch(base + '/client-log', { method: 'POST', headers: H(j), body: JSON.stringify({ device, build: 'old-build', entries: [{ at: new Date().toISOString(), last: new Date().toISOString(), kind: 'sync', message: 'Sync failed: server error 500', count: 3 }] }) });
check('a device report is accepted', (await post(alex, 'phone (Firefox, pc-lou:8443)')).status === 200);
await post(lou, 'mac (Chrome, pc-lou:8443)');
const lines = fs.readFileSync(`${S}/client-log.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('each line says whose device it is', lines.some((l) => l.account === 'Alex' && l.device.startsWith('phone')) && lines.some((l) => l.account === 'LouDodin'), JSON.stringify(lines));
const devs = JSON.parse(fs.readFileSync(`${S}/devices.json`, 'utf8'));
check('the version list is per account and device', !!devs['Alex · phone (Firefox, pc-lou:8443)'] && devs['Alex · phone (Firefox, pc-lou:8443)'].account === 'Alex', JSON.stringify(devs));

// 2. The health check makes one line per account, saying whose device it is
const hc = JSON.parse(execFileSync('python3', ['-I', '-c', `import sys, json; sys.argv=['x']; import importlib.util as u; s=u.spec_from_file_location('h','${root}/tools/healthcheck.py'); h=u.module_from_spec(s); s.loader.exec_module(h); h.check_device_errors(); print(json.dumps(h.checks))`], { encoding: 'utf8' }));
const ad = hc.find((c) => c.name === 'Device errors (24 h) · Alex');
const ld = hc.find((c) => c.name === 'Device errors (24 h)');
check("health check: Alex's device errors on their own line, for Alex, caused by his phone", ad?.account === 'Alex' && ad.cause?.[0] === 'Alex · phone (Firefox, pc-lou:8443)' && /3 on 1 device/.test(ad.detail), JSON.stringify(hc));
check("health check: Lou's under the usual name, for her", ld?.account === 'LouDodin', JSON.stringify(hc));

// 3. Views: a report with a server warning, a problem, Lou's and Alex's warnings
const report = { generated: new Date().toISOString(), status: 'fail', checks: [
	{ name: 'Vikunja server', status: 'ok', detail: 'version v2.7.1', fix: '' },
	{ name: 'Interruptions', status: 'warn', detail: 'the PC was off from 01:00 to 04:00', fix: 'Nothing if you know why.' },
	{ name: 'Sign-ups', status: 'fail', detail: 'open', fix: 'Close them.' },
	ld, ad,
	{ name: 'App versions · unknown account', status: 'warn', detail: 'still on an old version: phone (x)', fix: '', admin_only: true }
] };
fs.writeFileSync(`${S}/health.json`, JSON.stringify(report));
const view = async (j) => (await fetch(base + '/health.json', { headers: j ? H(j) : {} })).json();
const names = (v) => v.checks.map((c) => c.name);
const vA = await view(alex), vL = await view(lou), v0 = await view(null);
check("Alex sees the server's checks and his own, nothing of Lou's", names(vA).includes('Interruptions') && names(vA).includes('Device errors (24 h) · Alex') && !names(vA).includes('Device errors (24 h)') && !names(vA).some((x) => /unknown account/.test(x)) && vA.viewer.admin === false, JSON.stringify(names(vA)));
check('Lou (admin) sees everything, Alex\'s included', names(vL).length === 6 && vL.viewer.admin === true && vL.viewer.username === 'LouDodin', JSON.stringify(names(vL)));
check('without signing in: only the server\'s checks', names(v0).every((x) => !/·|Device errors/.test(x)) && names(v0).includes('Interruptions'), JSON.stringify(names(v0)));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const open = async (jwt) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
	await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
	const p = await ctx.newPage(); await p.goto(base + '/settings?tab=status'); await p.waitForTimeout(3000);
	return { ctx, p };
};
const L = await open(lou), A = await open(alex);
const issue = (p, t) => p.locator('.issue', { hasText: t });
// 4. What the admin sees in Help
{
	const t = await issue(L.p, 'Device errors (24 h) · Alex').innerText();
	check('admin: Alex\'s warning says whom it concerns and which device caused it', /Concerns: Alex/.test(t) && /Cause: Alex · phone/.test(t), t);
	check('admin: a server warning concerns everyone', /Concerns: everyone/.test(await issue(L.p, 'Interruptions').innerText()));
	check('admin: two buttons, just me / everyone', (await issue(L.p, 'Interruptions').getByRole('button', { name: 'Got it (just me)' }).count()) === 1 && (await issue(L.p, 'Interruptions').getByRole('button', { name: 'Got it (everyone)' }).count()) === 1);
	const at = await issue(A.p, 'Interruptions').innerText();
	check('Alex: one "Got it", no "Concerns" lines', (await issue(A.p, 'Interruptions').getByRole('button').count()) === 1 && !/Concerns:/.test(at), at);
	check('Alex: Lou\'s device errors are not shown to him', (await A.p.locator('.issue', { hasText: 'Device errors (24 h):' }).count()) === 0);
	if (process.env.SHOTS) await L.p.screenshot({ path: process.env.SHOTS + '/admin-warnings.png', fullPage: true });
}
// 5. "Got it (just me)": gone for Lou only
await issue(L.p, 'Interruptions').getByRole('button', { name: 'Got it (just me)' }).click(); await L.p.waitForTimeout(2500);
check('just me: gone from Lou\'s list, listed as "just you"', (await issue(L.p, 'Interruptions').count()) === 0 && /Interruptions \(just you\)/.test(await L.p.locator('.acked').textContent()), await L.p.locator('.acked').textContent().catch(() => ''));
await A.p.reload(); await A.p.waitForTimeout(3000);
check('just me: Alex still sees it', (await issue(A.p, 'Interruptions').count()) === 1);
check('just me: the shared report is unchanged', JSON.parse(fs.readFileSync(`${S}/health.json`, 'utf8')).checks.find((c) => c.name === 'Interruptions').status === 'warn');
// 6. "Got it (everyone)" on Alex's warning: gone for Alex too
await issue(L.p, 'Device errors (24 h) · Alex').getByRole('button', { name: 'Got it (everyone)' }).click(); await L.p.waitForTimeout(2500);
await A.p.reload(); await A.p.waitForTimeout(3000);
check('everyone: gone for Alex too', (await issue(A.p, 'Device errors (24 h) · Alex').count()) === 0, await A.p.locator('.settings-content').innerText());
const g = JSON.parse(fs.readFileSync(`${S}/acknowledged.json`, 'utf8'));
check('everyone: kept on the PC, with who did it', g['Device errors (24 h) · Alex']?.by === 'LouDodin', JSON.stringify(g));
// 7. Alex hides a server warning for himself: Lou is not affected; he cannot hide for everyone
await issue(A.p, 'Interruptions').getByRole('button', { name: 'Got it' }).click(); await A.p.waitForTimeout(2500);
const per = JSON.parse(fs.readFileSync(`${S}/acknowledged-users.json`, 'utf8'));
check('Alex\'s "Got it" is his own', !!per.Alex?.Interruptions && !!per.LouDodin?.Interruptions, JSON.stringify(per));
const r = await fetch(base + '/ack-warning', { method: 'POST', headers: H(alex), body: JSON.stringify({ name: 'App versions · unknown account', scope: 'me' }) });
check("Alex cannot acknowledge a warning he cannot see", r.status === 409, r.status);
const r2 = await fetch(base + '/ack-warning', { method: 'POST', headers: H(alex), body: JSON.stringify({ name: 'Device errors (24 h)', scope: 'everyone' }) });
check('nor anything "for everyone"', r2.status === 403, r2.status);
// 8. The hourly check keeps the acknowledgements in force and forgets the others
fs.writeFileSync(`${S}/acknowledged-users.json`, JSON.stringify({ ...per, Alex: { ...per.Alex, Gone: { detail: 'x', at: '2026-10-01' } } }));
const out = execFileSync('python3', ['-I', '-c', `import sys, json; sys.argv=['x','--quiet']; import importlib.util as u; s=u.spec_from_file_location('h','${root}/tools/healthcheck.py'); h=u.module_from_spec(s); s.loader.exec_module(h); h.checks.extend(json.load(open('${S}/health.json'))['checks']); [c.pop('acknowledged',None) for c in h.checks]; print(h.write_outputs())`], { encoding: 'utf8' }).trim();
const per2 = JSON.parse(fs.readFileSync(`${S}/acknowledged-users.json`, 'utf8'));
check('hourly check: a "Got it" whose warning is gone is forgotten, the others kept', !per2.Alex?.Gone && !!per2.Alex?.Interruptions && !!per2.LouDodin?.Interruptions, JSON.stringify(per2));
const h2 = JSON.parse(fs.readFileSync(`${S}/health.json`, 'utf8'));
check("hourly check: Lou's own \"Got it\" counts for her phone alerts and PC notifications", h2.checks.find((c) => c.name === 'Interruptions').ack_admin === true && h2.status === 'fail' && out === 'fail', out + ' ' + JSON.stringify(h2.checks.map((c) => [c.name, c.status, c.ack_admin])));
await browser.close();
for (const f of ['health.json', 'acknowledged.json', 'acknowledged-users.json']) fs.rmSync(`${S}/${f}`, { force: true });
console.log(`${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
