const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: require('os').homedir() + '/.cache/ms-playwright/chromium-1217/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    storageState: 'tests/e2e/.auth/session.json',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/decks-page.png', fullPage: true });
  console.log('DONE', page.url());
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
