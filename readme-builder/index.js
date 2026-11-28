import puppeteer from 'puppeteer';
import Handlebars from "handlebars";
import fs from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { parseAll } from './parse-metrics.js';
import { loadSkillGroups } from './skills.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
(async () => {
    const loadFileAsString = (path) => fs.readFileSync(path).toString();

    const achievements = loadFileAsString(join(__dirname, '..', 'metrics.achievements.svg'));
    const activity = loadFileAsString(join(__dirname, '..', 'metrics.activity.svg'));
    const community = loadFileAsString(join(__dirname, '..', 'metrics.community.svg'));
    const languages = loadFileAsString(join(__dirname, '..', 'metrics.languages.svg'));

    const metrics = { achievements, activity, community, languages };
    const parsed = parseAll(metrics);
    for (const [key, value] of Object.entries(parsed)) {
        if (!value) console.warn(`Could not parse ${key}, falling back to the raw SVG`);
    }

    const templlateFile =  fs.readFileSync(join(__dirname, 'template', 'index.handlebars'));
    const template = Handlebars.compile(templlateFile.toString());
    const skillGroups = await loadSkillGroups();
    const rendered = template({ ...metrics, ...parsed, skillGroups });

    fs.writeFileSync(join(__dirname, 'template', 'index.html'), rendered);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    });
    const page = await browser.newPage();
    const url = join(__dirname, 'template', 'index.html');
    console.log(`Index.html is located at ${url}`);
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.goto(`file://${url}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // template/pixelate.js turns the skill icons into pixel sprites and flags the body when done
    await page
        .waitForFunction(() => document.body.dataset.pixelated, { timeout: 15000 })
        .catch(() => console.warn('Skill icons were not pixelated in time, using the plain icons'));

    const bottom = await page.evaluate('document.getElementById("end").getBoundingClientRect().bottom');
    const height = Math.round(bottom + 20);
    await page.setViewport({ width: 800, height: height, deviceScaleFactor: 2 });

    const readmeImagePath = join(__dirname, '..', 'readme.webp');
    await page.screenshot({
        optimizeForSpeed: false,
        quality: 100,
        type: 'webp',
        path: readmeImagePath
    });
    await browser.close();
    if (!fs.existsSync(readmeImagePath)) {
        throw new Error('Readme image not created');
    }
    console.log(`Created readme image at: ${readmeImagePath}`);
})();
