// render.cjs — Playwright rendering script for Agent MCP Skill Plugin social cards
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TASK_DIR = __dirname;
const HTML_PATH = path.join(TASK_DIR, 'index.html');
const OUTPUT_DIR = path.join(TASK_DIR, 'output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const targets = [
  ['#xhs-01',      'xhs-01-cover.png'],
  ['#wechat-21x9', 'wechat-21x9-cover.png'],
  ['#wechat-1x1',  'wechat-1x1-cover.png'],
  ['#wechat-pair-preview', 'wechat-pair-preview.png'],
];

async function render() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const fileUrl = 'file://' + HTML_PATH.replace(/\\/g, '/');
  console.log('Opening:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  // Wait for fonts to load
  await page.waitForTimeout(2000);

  for (const [selector, filename] of targets) {
    const el = page.locator(selector);
    const count = await el.count();
    if (count === 0) {
      console.warn(`Selector ${selector} not found — skipping ${filename}`);
      continue;
    }
    const box = await el.boundingBox();
    if (!box) {
      console.warn(`No bounding box for ${selector} — skipping ${filename}`);
      continue;
    }
    console.log(`Screenshoting ${selector} (${box.width}x${box.height}) → ${filename}`);
    await el.screenshot({
      path: path.join(OUTPUT_DIR, filename),
      type: 'png',
    });
    console.log(`  → Saved: ${path.join(OUTPUT_DIR, filename)}`);
  }

  await browser.close();
  console.log('Done.');
}

render().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
