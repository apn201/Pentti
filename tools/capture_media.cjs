// Screenshots of the real app, for Devpost and the thumbnails. See docs/media/README.md.
// Read only: it switches tabs, picks a plant and opens deep links. It never presses
// Create tasks, Reset, Load or "I checked this".
//
// Needs a browser started with --remote-debugging-port=9333 and signed in by a person,
// and playwright-core on NODE_PATH (not a dependency of the app).
//   node tools/capture_media.cjs [outDir]
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const SITE = process.env.PENTTI_SITE;
if (!SITE) { console.error('Set PENTTI_SITE, for example https://<your site>.atlassian.net'); process.exit(2); }
const APP = 'd2fcbee5-3e1f-41db-8db4-e4360bef4b93';
const ENV = process.env.PENTTI_ENV || 'f78c5f0f-7baf-408a-ab4b-b3d7dc463f0c';
const PAGE = `${SITE}/jira/apps/${APP}/${ENV}`;
const OLD_FAITHFUL = 'a_d4mjq';
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'media');

async function appFrame(page) {
  const end = Date.now() + 40000;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      if (await f.locator('nav.tabs').count().catch(() => 0)) return f;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Pentti page did not load, is this browser signed in?');
}

async function shot(page, frame, name, wait) {
  if (wait) await frame.locator(wait).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  // The app alone, without Jira around it, full length. The asset card is taller than the window.
  await frame.locator('main').screenshot({ path: path.join(OUT, 'crops', `${name}.png`) });
  console.log('saved', name);
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'crops'), { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  let f = await appFrame(page);
  await shot(page, f, 'gap-map', 'svg.map');

  await f.getByRole('button', { name: 'People', exact: true }).click();
  await shot(page, f, 'people', 'tr.hot');

  await f.getByRole('button', { name: 'Closing list', exact: true }).click();
  await f.locator('select').first().waitFor();
  await f.locator('select').first().selectOption({ label: 'Birch' });
  await f.locator('p.total', { hasText: 'Birch' }).waitFor({ timeout: 30000 });
  await shot(page, f, 'closing-list', 'p.total');

  await page.goto(`${PAGE}/asset/${OLD_FAITHFUL}`, { waitUntil: 'domcontentloaded' });
  f = await appFrame(page);
  await f.getByText('What is not known').first().waitFor({ timeout: 30000 });
  await shot(page, f, 'asset-card');

  await page.close();
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
