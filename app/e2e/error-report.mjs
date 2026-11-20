// Error report, old-version safety and auto-update (21 Oct 2026). Against a copy of real data,
// with the app served by tools/serve_app.py (it holds /client-log and /report).
// Usage: node e2e/error-report.mjs <appBase> <apiBase> <user> <password> <appBuildDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base, api, user, pass, buildDir] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const H = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
await c.grantPermissions(['clipboard-read', 'clipboard-write']);
await c.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); } }, [api, jwt]);
const p = await c.newPage();
await p.goto(base + '/inbox'); await p.waitForTimeout(12000);

// Tasks to validate outside the Inbox project carry the old flag again (older app versions hide them otherwise)
const t311 = await (await fetch(`${api}/api/v1/tasks/311`, { headers: H })).json();
check('older app versions: a task to validate outside the Inbox gets the old flag back', (t311.labels || []).some((l) => l.title === 'ctx:review'), JSON.stringify((t311.labels || []).map((l) => l.title)));

// An error on this device
// a task still in the Inbox project (no project chosen)
const inboxRow = p.locator('.row:has(.checkbox)', { hasText: 'packages et fonctions julia' }).first();
await inboxRow.locator('.checkbox').click(); await p.waitForTimeout(500);
const errText = (await p.locator('.toast.error').first().textContent().catch(() => '')).trim();
check('an error is shown (validating a task with no project)', /choose a project/.test(errText), errText);

// The report
await p.goto(base + '/settings?tab=status'); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Error report (30 days)' }).click();
await p.locator('textarea.report').waitFor({ timeout: 20000 });
const rep = await p.locator('textarea.report').inputValue();
check('one click makes the report', rep.startsWith('# Tasks app: error report, last 30 days'), rep.slice(0, 80));
check('  with the server health now (problems and their fix)', /## Server health now/.test(rep) && /Power/.test(rep) && /update-vikunja/.test(rep), rep.slice(0, 600));
check('  the health history, automations, Vikunja, off-PC copy and alerts', ['## Health check: hours not OK', '## PC automations', '## Vikunja server warnings', '## Off-PC copy', '## Alerts (ntfy)'].every((h) => rep.includes(h)));
check('  and the error of this device, with its name', /## Errors on the devices[\s\S]*choose a project[\s\S]*device: computer|## Errors on the devices[\s\S]*choose a project/.test(rep), rep.slice(rep.indexOf('## Errors on the devices'), rep.indexOf('## Errors on the devices') + 300));
check('  copied to the clipboard', (await p.evaluate(() => navigator.clipboard.readText())) === rep);
const noAuth = await fetch(base + '/report');
check('the report is refused without signing in', noAuth.status === 401, noAuth.status);
await p.keyboard.press('Escape');

// Auto-update: a newer version on the server reloads an idle app once
const vfile = buildDir + '/version.txt';
const real = fs.readFileSync(vfile, 'utf8');
try {
	fs.writeFileSync(vfile, '2099-01-01T00:00:00.000Z\n');
	await p.evaluate(() => { window.__marker = 1; });
	await p.goto(base + '/'); await p.evaluate(() => { window.__marker = 1; });
	await p.waitForTimeout(9000);
	const reloaded = await p.evaluate(() => window.__marker === undefined);
	check('a newer version on the server: the app reloads by itself when idle', reloaded);
	await p.waitForTimeout(7000);
	check('  only once (then it offers it in a banner)', (await p.locator('.update-banner').count()) === 1);
} finally {
	fs.writeFileSync(vfile, real);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
