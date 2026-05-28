import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

const outDir = './output';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

const filePath = 'file://' + path.resolve('./index.html');
await page.goto(filePath, { waitUntil: 'networkidle' });

// XHS 封面 3:4
await page.locator('#xhs-cover').screenshot({
  path: `${outDir}/xhs-01-cover.png`,
  type: 'png'
});
console.log('✓ XHS 封面已导出: output/xhs-01-cover.png');

// WeChat 21:9
await page.locator('#wechat-21x9').screenshot({
  path: `${outDir}/wechat-21x9-cover.png`,
  type: 'png'
});
console.log('✓ WeChat 21:9 封面已导出: output/wechat-21x9-cover.png');

// WeChat 1:1
await page.locator('#wechat-1x1').screenshot({
  path: `${outDir}/wechat-1x1-cover.png`,
  type: 'png'
});
console.log('✓ WeChat 1:1 封面已导出: output/wechat-1x1-cover.png');

// 封面对预览
await page.locator('.pair-preview').screenshot({
  path: `${outDir}/wechat-cover-pair-preview.png`,
  type: 'png'
});
console.log('✓ WeChat 封面对预览已导出: output/wechat-cover-pair-preview.png');

await browser.close();
console.log('\n✅ 全部导出完成!');
