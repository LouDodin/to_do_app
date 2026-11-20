// Screenshots + error check of the app against a LOCAL Vikunja holding a copy of real data.
// Usage: node e2e/real.mjs <appBase> <apiBase> <jwt> <outDir> [phone|desktop]
import { chromium } from 'playwright-core';
const [base, api, jwt, out, mode = 'phone'] = process.argv.slice(2);
const phone = mode === 'phone';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([a, j]) => { localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); }, [api, jwt]);
const page = await ctx.newPage();
const errors = []; const bad = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.url().startsWith(api) && r.status() >= 400) bad.push(`${r.request().method()} ${r.url().replace(api, '')} ${r.status()}`); });
const routes = (process.env.ROUTES || '/,/weekly,/today-review,/bin,/settings').split(',');
await page.goto(base + '/'); await page.waitForTimeout(6000);
for (const r of routes) {
  await page.goto(base + r); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${mode}${r.replace(/\//g, '_')}.png`, fullPage: false });
}
const views = await page.evaluate(() => ({ tasks: document.querySelectorAll('.row').length, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
console.log(JSON.stringify({ views, errors, bad: [...new Set(bad)] }, null, 1));
await browser.close();
