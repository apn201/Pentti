// Renders the layouts from tools/build_thumbnails.py to PNG, in the browser on port 9333.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const MEDIA = path.join(__dirname, '..', 'docs', 'media');
const JOBS = [
  ['_thumb-youtube.html', 'thumb-youtube-1280x720.png', 1280, 720],
  ['_thumb-devpost.html', 'thumb-devpost-3x2.png', 1500, 1000],
];

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = b.contexts()[0];
  for (const [html, png, width, height] of JOBS) {
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await p.setContent(fs.readFileSync(path.join(MEDIA, html), 'utf8'), { waitUntil: 'load' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(MEDIA, png), clip: { x: 0, y: 0, width, height } });
    await p.close();
    fs.unlinkSync(path.join(MEDIA, html));
    console.log('saved', png);
  }
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
