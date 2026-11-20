import { chromium } from 'playwright-core';
const [html, pdf, label = 'User guide'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('file://' + html, { waitUntil: 'load' });
await p.waitForTimeout(800);
await p.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#8b8b96;padding:0 17mm;display:flex;justify-content:space-between"><span>Tasks · ${label}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
await b.close();
