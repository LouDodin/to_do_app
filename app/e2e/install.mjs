// "Install the app" in Help (29 Oct 2026): offered on phones too, with the steps of the browser in
// use when it cannot open its own Install window (Firefox, Samsung Internet, iPhone, WhatsApp…).
// Usage: node e2e/install.mjs <app> <api> <user> <pass>   (a TEST Vikunja)
import { chromium } from 'playwright-core';
const [base, api, user, pass] = process.argv.slice(2);
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + detail}`); };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const UA = {
	firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
	whatsapp: 'Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
	iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};
async function openHelp(userAgent, phone = true) {
	const ctx = await b.newContext({ userAgent, viewport: phone ? { width: 412, height: 915 } : { width: 1280, height: 900 }, isMobile: phone, hasTouch: phone });
	await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(2500);
	await p.getByRole('button', { name: 'Help and settings' }).first().click(); await p.waitForTimeout(800);
	return { ctx, p };
}
for (const [name, ua, where, step] of [['Firefox on Android', UA.firefox, 'Firefox on Android', /menu ⋮/], ['WhatsApp', UA.whatsapp, 'inside another app', /Open in Chrome/], ['iPhone', UA.iphone, 'Safari on iPhone', /Add to Home Screen/]]) {
	const { ctx, p } = await openHelp(ua);
	const sec = p.locator('section.install');
	check(`${name}: "Install the app" is at the top of Help`, (await sec.count()) === 1 && (await p.locator('.settings-content section').first().getAttribute('class'))?.includes('install'));
	await sec.getByRole('button', { name: 'Install the app' }).click(); await p.waitForTimeout(300);
	const text = await sec.textContent();
	check(`${name}: tapping it shows the steps for this browser`, text.includes(where) && step.test(text), text);
	if (name === 'Firefox on Android') await p.screenshot({ path: '/tmp/claude-0/install-firefox.png' });
	await ctx.close();
}
// Installed (opened from its icon): nothing to offer.
{
	const ctx = await b.newContext({ userAgent: UA.firefox, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
	await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); }, [api, jwt]);
	const p = await ctx.newPage(); await p.goto(base + '/'); await p.waitForTimeout(2500);
	await p.getByRole('button', { name: 'Help and settings' }).first().click(); await p.waitForTimeout(800);
	check('installed app: no "Install the app" section', (await p.locator('section.install').count()) === 0);
	await ctx.close();
}
await b.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
