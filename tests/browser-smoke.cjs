// Optional integration check: requires Playwright and an installed Chromium browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const prefix = '/Interactive-Visualization/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('Not found');
    const target = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (path.relative(root, target).startsWith('..')) throw new Error('Not found');
    const data = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = process.env.TEST_SITE_URL || `http://127.0.0.1:${server.address().port}${prefix}`;
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  const errors = [];
  try {
    await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('sample-count').textContent === '342');
    await page.waitForFunction(() => document.querySelectorAll('#chart .trendLines_marks path').length === 4);
    await page.selectOption('#trend-mode', 'none');
    await page.waitForFunction(() => document.querySelectorAll('#chart .trendLines_marks path').length === 0);
    await page.selectOption('#trend-mode', 'species');
    await page.waitForFunction(() => document.querySelectorAll('#chart .trendLines_marks path').length === 3);
    await page.selectOption('#trend-mode', 'both');
    await page.locator('#chart').scrollIntoViewIfNeeded();
    const plot = await page.locator('#chart path.background').first().boundingBox();
    await page.mouse.move(plot.x + plot.width * .05, plot.y + plot.height * .05);
    await page.mouse.down();
    await page.mouse.move(plot.x + plot.width * .6, plot.y + plot.height * .8, { steps: 15 });
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById('brush-summary').textContent.startsWith('框选 '));
    assert.ok(!(await page.textContent('#brush-summary')).includes('框选 0 /'));
    await page.click('#clear-brush');
    await page.waitForFunction(() => document.getElementById('clear-brush').disabled);
    await page.click('#capture-a');
    await page.click('[data-guide="female"]');
    await page.waitForFunction(() => document.getElementById('sample-count').textContent === '34');
    await page.click('#capture-b');
    assert.equal(await page.textContent('#compare-a-n'), '342');
    assert.equal(await page.textContent('#compare-b-n'), '34');
    assert.equal(await page.textContent('#compare-b-r'), '0.242');
    await page.waitForSelector('#compare-b-chart svg');
    assert.match(await page.textContent('#comparison-delta'), /34 条重合记录/);

    await page.click('#reset');
    await page.locator('.range-disclosure summary').click();
    for (const [id, value] of [['flipper-min', '180'], ['flipper-max', '200'], ['mass-min', '3000'], ['mass-max', '4000']]) await page.fill(`#${id}`, value);
    await page.locator('#range-form button').click();
    await page.waitForFunction(() => document.getElementById('brush-summary').textContent.includes('144 / 342'));
    await page.click('#capture-a');
    await page.click('[data-guide="male"]');
    await page.click('#restore-a');
    await page.waitForFunction(() => document.getElementById('brush-summary').textContent.includes('144 / 342'));
    assert.equal(await page.textContent('#compare-a-n'), '144');
    assert.equal(await page.textContent('#compare-b-n'), '34');
    assert.match(await page.textContent('#compare-a-scope'), /180—200/);

    await page.click('#compare-preset');
    await page.waitForFunction(() => document.querySelector('#compare-a-n').textContent === '34' && document.querySelector('#compare-b-r').textContent === '0.665');
    assert.match(await page.textContent('#comparison-delta'), /0 条重合记录/);
    await page.waitForSelector('#compare-distribution svg');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-comparison');
    const download = await downloadPromise;
    const csvPath = path.join(root, '.tmp', 'comparison.csv');
    await download.saveAs(csvPath);
    assert.equal((await fs.readFile(csvPath, 'utf8')).trim().split(/\r?\n/).length, 69);
    await page.locator('#compare-workspace').screenshot({ path: path.join(root, '.tmp', 'comparison-desktop.png') });
    await page.click('#restore-a');
    await page.waitForFunction(() => document.getElementById('sample-count').textContent === '34');
    assert.equal(await page.inputValue('#sex'), 'female');
    await page.selectOption('#sex', 'unknown');
    await page.waitForFunction(() => document.getElementById('sample-count').textContent === '0');
    assert.equal(await page.isDisabled('#capture-a'), true);
    assert.equal(await page.textContent('#compare-a-n'), '34');
    await page.click('#clear-a');
    assert.equal(await page.isVisible('#comparison-results'), false);
    assert.equal(await page.isDisabled('#export-comparison'), true);
    await page.click('#reset');
    await page.focus('#capture-a'); await page.keyboard.press('Enter');
    assert.equal(await page.textContent('#compare-a-n'), '342');
    await page.click('#compare-preset');

    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.locator('#compare-workspace').screenshot({ path: path.join(root, '.tmp', 'comparison-mobile.png') });
    await page.locator('.analysis-layout').screenshot({ path: path.join(root, '.tmp', 'exploration-mobile.png') });
    assert.deepEqual(errors, []);
    const recovery = await browser.newPage();
    await recovery.route('**/penguins.csv', route => route.abort());
    await recovery.goto(base);
    await recovery.waitForSelector('#load-state.error');
    assert.equal(await recovery.isDisabled('#capture-a'), true);
    await recovery.unroute('**/penguins.csv');
    await recovery.click('#retry');
    await recovery.waitForFunction(() => document.getElementById('sample-count').textContent === '342');
    assert.equal(await recovery.isDisabled('#capture-a'), false);
    await recovery.close();
    console.log('Browser checks passed: trend modes, pointer brushing, A/B capture, persistence, range restore, preset, overlap, CSV export, empty states, keyboard, failed-load recovery, project subpath and 320–1365px layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
