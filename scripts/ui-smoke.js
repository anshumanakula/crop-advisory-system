'use strict';
// Optional UI smoke test. Needs: npm i --no-save puppeteer-core, and a running server.
// Usage: CHROME_PATH=/path/to/chrome node scripts/ui-smoke.js [baseUrl] [screenshotPrefix]
const puppeteer = require('puppeteer-core');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3];


async function submitAndWait(page) {
  await page.evaluate(() => document.getElementById('results').replaceChildren());
  await page.click('#btn-submit');
  await page.waitForSelector('#compare-table', { timeout: 8000 });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const problems = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push('console.' + m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForSelector('#advisor-form', { timeout: 5000 });

  const steps = [];
  const profiles = await page.$$eval('#f-profile option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })).filter((o) => o.v));

  for (const p of profiles) {
    await page.select('#f-profile', p.v);
    await submitAndWait(page);
    const info = await page.evaluate(() => ({
      first: document.querySelector('.crop-card h3').textContent,
      cards: document.querySelectorAll('.crop-card').length,
      checked: [...document.querySelectorAll('input[data-crop]:checked')].length,
      conf: document.querySelector('#confidence strong').textContent,
      cols: document.querySelectorAll('#compare-table thead th').length,
      rows: document.querySelectorAll('#compare-table tbody tr').length,
      best: document.querySelector('#compare-best').textContent
    }));
    steps.push({ profile: p.t, ...info });
    if (p.v === 'monsoon-paddy' && OUT) {
      await page.screenshot({ path: OUT + '-desktop.png', fullPage: true });
    }
  }

  // toggle a third crop -> table gains a column
  await page.select('#f-profile', 'monsoon-paddy');
  await submitAndWait(page);
  const boxes = await page.$$('input[data-crop]');
  await boxes[2].click();
  await page.waitForFunction(() => document.querySelectorAll('#compare-table thead th').length === 4, { timeout: 5000 });
  const disabledAt3 = await page.$$eval('input[data-crop]', (bs) => bs.filter((b) => !b.checked).every((b) => b.disabled));
  // uncheck down to 1 -> message
  await boxes[2].click();
  await boxes[1].click();
  await page.waitForSelector('#compare-msg', { timeout: 5000 });
  const msg = await page.$eval('#compare-msg', (n) => n.textContent);

  // error path: clear everything, submit
  await page.click('#btn-reset');
  await page.click('#btn-submit');
  await page.waitForFunction(() => document.querySelector('#err-season').textContent.length > 0, { timeout: 5000 });
  const errs = await page.evaluate(() => ({
    season: document.querySelector('#err-season').textContent,
    form: document.querySelector('#form-error').textContent
  }));

  // mobile screenshot
  if (OUT) {
    await page.setViewport({ width: 390, height: 900 });
    await page.select('#f-profile', 'black-soil-cotton');
    await submitAndWait(page);
    await page.screenshot({ path: OUT + '-mobile.png', fullPage: true });
  }

  console.log(JSON.stringify({ steps, disabledAt3, msg, errs, problems }, null, 2));
  await browser.close();
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
