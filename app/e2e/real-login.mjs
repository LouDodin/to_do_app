// Sign-in against a LOCAL Vikunja (copy of real data) with two-factor enabled.
// Usage: node e2e/real-login.mjs <appBase> <apiBase> <user> <password> <totpScript>
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [base, api, user, pass, totpScript] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.goto(base + '/login');
await page.fill('input[type=url]', api);
await page.fill('input[autocomplete=username]', user);
await page.fill('input[type=password]', 'wrong-password');
await page.click('button[type=submit]'); await page.waitForTimeout(800);
check('login: wrong password says so', (await page.textContent('.error'))?.includes('Incorrect'), await page.textContent('.error'));
await page.fill('input[type=password]', pass);
await page.click('button[type=submit]'); await page.waitForTimeout(800);
check('login: two-factor field appears when the account needs it', await page.locator('input[autocomplete=one-time-code]').isVisible());
const code = execFileSync('python3', [totpScript]).toString().trim();
await page.fill('input[autocomplete=one-time-code]', code);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(5000);
check('login: signed in with the code and the tasks load', !page.url().includes('/login') && (await page.locator('.row').count()) > 0, page.url());
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
