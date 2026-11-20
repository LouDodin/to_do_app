// The server's health report (state/health.json, served at /health.json) reaches the app.
// Usage: node e2e/health.mjs <appBase> <apiBase> <jwt>   (a failing report must be in place)
import { chromium } from 'playwright-core';
const [base, api, jwt] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForTimeout(3000);
check('health: a failing check shows a banner on every device', await page.locator('.health-banner').isVisible());
check('health: the banner names the problem', (await page.locator('.health-banner').textContent())?.includes('Backups'));
await page.locator('.health-banner .x').tap(); await page.waitForTimeout(300);
check('health: the banner can be hidden', !(await page.locator('.health-banner').isVisible()));
await page.goto(base + '/settings?tab=status'); await page.waitForTimeout(2000);
const txt = await page.textContent('main');
await page.goto(base + '/settings?tab=settings'); await page.waitForTimeout(1000);
const txt2 = await page.textContent('main');
check('health: Settings lists the problem and how to fix it', txt.includes('last backup 40 h old') && txt.includes('backup-now.bat'));
check('settings: shows server version', txt2.includes('Vikunja v2.7.0'), txt2.slice(0, 400));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
