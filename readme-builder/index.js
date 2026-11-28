import puppeteer from 'puppeteer';
import Handlebars from "handlebars";
import fs from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { parseAll } from './parse-metrics.js';
import { loadSkillGroups } from './skills.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIN_HEIGHT = 1000; // CSS px; the full card is ~1880px, anything far shorter is broken
const FONTS = ['12px Silkscreen', '12px "Space Grotesk"'];
const problems = [];

// Renders the README card and validates it. On any problem the process exits non-zero
// and readme.webp is left untouched, so CI never commits a broken image.
async function main() {
    const loadFileAsString = (path) => fs.readFileSync(path).toString();

    const achievements = loadFileAsString(join(__dirname, '..', 'metrics.achievements.svg'));
    const activity = loadFileAsString(join(__dirname, '..', 'metrics.activity.svg'));
    const community = loadFileAsString(join(__dirname, '..', 'metrics.community.svg'));
    const languages = loadFileAsString(join(__dirname, '..', 'metrics.languages.svg'));

    const metrics = { achievements, activity, community, languages };
    const parsed = parseAll(metrics);
    for (const [key, value] of Object.entries(parsed)) {
        // the raw-SVG fallback still renders, but doesn't match the design
        if (!value) problems.push(`could not parse ${key} (template would fall back to the raw SVG)`);
    }

    const templlateFile =  fs.readFileSync(join(__dirname, 'template', 'index.handlebars'));
    const template = Handlebars.compile(templlateFile.toString());
    const skillGroups = await loadSkillGroups();
    const rendered = template({ ...metrics, ...parsed, skillGroups });
    const expectedPixelIcons = (rendered.match(/<img\b[^>]*\bdata-pixelate\b/g) || []).length;

    fs.writeFileSync(join(__dirname, 'template', 'index.html'), rendered);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    });
    try {
        const page = await browser.newPage();
        page.on('requestfailed', (request) =>
            problems.push(`request failed: ${request.url().slice(0, 120)} (${request.failure()?.errorText})`));
        page.on('response', (response) => {
            if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url().slice(0, 120)}`);
        });
        page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

        const url = join(__dirname, 'template', 'index.html');
        console.log(`Index.html is located at ${url}`);
        await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
        await page.goto(`file://${url}`, { waitUntil: 'networkidle0' });
        await page.evaluate(() => document.fonts.ready);
        // template/pixelate.js turns the icons into pixel sprites and flags the body when done
        await page
            .waitForFunction(() => document.body.dataset.pixelated, { timeout: 15000 })
            .catch(() => problems.push('icons were not pixelated within 15s'));

        const report = await page.evaluate((fonts) => ({
            brokenImages: [...document.images]
                .filter((img) => !img.complete || img.naturalWidth === 0)
                .map((img) => img.alt || img.src.slice(0, 80)),
            unpixelated: [...document.querySelectorAll('img[data-pixelate]')].map((img) => img.alt),
            pixelated: document.querySelectorAll('canvas.skill-icon, canvas.ach-icon-img').length,
            missingFonts: fonts.filter((font) => !document.fonts.check(font)),
            hasEnd: Boolean(document.getElementById('end')),
        }), FONTS);

        if (report.brokenImages.length) problems.push(`images not loaded: ${report.brokenImages.join(', ')}`);
        if (report.unpixelated.length) problems.push(`icons not pixelated: ${report.unpixelated.join(', ')}`);
        if (report.pixelated !== expectedPixelIcons) {
            problems.push(`expected ${expectedPixelIcons} pixel icons, found ${report.pixelated}`);
        }
        if (report.missingFonts.length) problems.push(`fonts not loaded: ${report.missingFonts.join(', ')}`);
        if (!report.hasEnd) problems.push('#end element missing, cannot size the screenshot');

        if (problems.length) throw new Error('render validation failed');

        const bottom = await page.evaluate('document.getElementById("end").getBoundingClientRect().bottom');
        const height = Math.round(bottom + 20);
        if (height < MIN_HEIGHT) {
            problems.push(`page is only ${height}px tall (expected at least ${MIN_HEIGHT}px)`);
            throw new Error('render validation failed');
        }
        await page.setViewport({ width: 800, height: height, deviceScaleFactor: 2 });

        // write next to the real file first, so a failed screenshot never replaces a good image
        const readmeImagePath = join(__dirname, '..', 'readme.webp');
        const tmpPath = `${readmeImagePath}.tmp`;
        await page.screenshot({
            optimizeForSpeed: false,
            quality: 100,
            type: 'webp',
            path: tmpPath
        });
        if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
            fs.rmSync(tmpPath, { force: true });
            problems.push('screenshot is empty');
            throw new Error('render validation failed');
        }
        fs.renameSync(tmpPath, readmeImagePath);
        console.log(`Created readme image at: ${readmeImagePath} (800x${height}, ${expectedPixelIcons} pixel icons)`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(`readme-builder: ${error.message}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('readme.webp was NOT updated');
    process.exitCode = 1;
});
