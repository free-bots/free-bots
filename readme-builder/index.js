import puppeteer from 'puppeteer';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
    const url = join(__dirname, 'template', 'index.html');
    console.log(`Index.html is located at ${url}`);
    await page.goto(`file://${url}`);
    await page.screenshot({
        optimizeForSpeed: false,
        quality: 100,
        type: 'webp',
        path: join(__dirname, '..', 'readme.webp')
    });
    console.log('Created readme image');
    await browser.close();
})();
