// The filter box at the top of the home page (19 Oct 2026, reworked 25 Oct 2026), against a real
// Vikunja with a copy of the data.
// Usage: node e2e/self-filter.mjs <appBase> <apiBase> <user> <password> [shotDir]
import { chromium } from 'playwright-core';
const [base, api, user, pass, shots] = process.argv.slice(2);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  → ' + d}`); };
const jwt = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json()).token;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }]]) {
	const ctx = await browser.newContext(opts);
	await ctx.addInitScript(([a, j]) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('vikunja_api_url', a); localStorage.setItem('vikunja_jwt', j); localStorage.setItem('view', 'all'); } }, [api, jwt]);
	const p = await ctx.newPage();
	await p.goto(base + '/'); await p.waitForTimeout(6000);
	const box = p.getByRole('textbox', { name: 'Filter tasks' });
	const sections = async () => (await p.locator('h2.section-title').allTextContents()).join(',');
	const results_ = p.locator('section.results');
	const rowsText = async () => (await results_.locator('.row').allTextContents()).map((s) => s.replace(/\s+/g, ' '));
	// Empty: one box at the top, then Today, Red, Available; no "My filter" / all-the-rest list
	check(`${name}: the filter box is at the top, before Today`, await p.evaluate(() => { const f = document.querySelector('.finder'); const h = document.querySelector('h2.section-title'); return !!f && !!h && !!(f.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING); }));
	check(`${name}: empty, it is only a search box (no other controls)`, (await p.locator('.finder select').count()) === 0 && (await p.locator('.finder .more').count()) === 0);
	check(`${name}: sections Today, Red, Available only (no list of all other tasks)`, (await sections()) === 'Today,Red,Available', await sections());
	// Typing shows matching tasks at once, instead of the blocks
	await box.click(); await box.pressSequentially('postcard', { delay: 20 }); await p.waitForTimeout(500);
	let rows = await rowsText();
	check(`${name}: typing shows the matching tasks at once`, rows.length >= 3 && rows.every((r) => /postcard/i.test(r)), rows.length + ' ' + rows.slice(0, 2));
	check(`${name}: and hides the blocks meanwhile`, (await sections()) === '', await sections());
	// Words also find labels: "anthonin" is a label name, not in any title
	await box.fill('anthonin'); await p.waitForTimeout(400);
	rows = await rowsText();
	check(`${name}: a label's name finds its tasks`, rows.length >= 1 && rows.some((r) => /Anthonin/.test(r)), JSON.stringify(rows));
	check(`${name}: the matching label is proposed`, (await p.locator('.finder .menu .item', { hasText: 'anthonin' }).count()) === 1);
	// Enter makes it a label chip; the box empties for the next one
	await p.keyboard.press('Enter'); await p.waitForTimeout(400);
	check(`${name}: Enter turns it into a label chip`, (await p.locator('.finder .chip').count()) === 1 && (await box.inputValue()) === '');
	await box.fill('dad'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
	check(`${name}: two labels with "All of them": nothing has both`, (await results_.locator('.row').count()) === 0, await results_.locator('.row').count());
	await p.getByRole('button', { name: 'Any of them' }).click(); await p.waitForTimeout(400);
	rows = await rowsText();
	check(`${name}: "Any of them": tasks with either label`, rows.length >= 2 && rows.some((r) => /for Dad/.test(r)) && rows.some((r) => /Anthonin/.test(r)), JSON.stringify(rows));
	await p.getByRole('button', { name: 'All of them' }).click();
	// Words AND labels
	await box.fill('postcard'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
	await p.locator('.finder .chip .remove').first().click(); await p.waitForTimeout(400);
	rows = await rowsText();
	check(`${name}: words AND label`, rows.length === 1 && /for Dad/.test(rows[0]), JSON.stringify(rows));
	// Tap the chip: "without dad"
	await p.locator('.finder .chip .toggle').first().click(); await p.waitForTimeout(400);
	rows = await rowsText();
	check(`${name}: tapping the label excludes it`, rows.length >= 2 && rows.every((r) => !/for Dad/.test(r)), JSON.stringify(rows));
	check(`${name}: the count matches`, (await p.locator('.finder .count').textContent()).startsWith(String(rows.length)), await p.locator('.finder .count').textContent());
	if (shots) await p.screenshot({ path: `${shots}/self-filter-${name}.png`, fullPage: false });
	const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	check(`${name}: no sideways scrolling`, overflow <= 1, overflow);
	// × clears it and the blocks come back
	await p.getByRole('button', { name: 'Clear the filter' }).click(); await p.waitForTimeout(400);
	check(`${name}: × clears it and the blocks come back`, (await sections()) === 'Today,Red,Available' && (await p.locator('.finder .chip').count()) === 0, await sections());
	// Esc clears too; a reload always starts empty
	await box.fill('postcard'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	check(`${name}: Esc (twice: menu, then filter) clears it`, (await box.inputValue()) === '' && (await sections()) === 'Today,Red,Available', await box.inputValue());
	await box.fill('postcard'); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(5000);
	check(`${name}: after a reload the home page opens on the blocks, filter empty`, (await p.getByRole('textbox', { name: 'Filter tasks' }).inputValue()) === '' && (await sections()) === 'Today,Red,Available');
	await ctx.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
