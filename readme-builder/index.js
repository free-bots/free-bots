import puppeteer from 'puppeteer';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
    await page.goto(join(__dirname, 'template', "index.html"));
    await page.screenshot({
        optimizeForSpeed: false,
        quality: 100,
        type: 'webp',
        path: join(__dirname, '..', 'readme.webp')
    })
    await browser.close();
})();
