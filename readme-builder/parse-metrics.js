// Extracts the numbers from the gh-metrics SVGs so the template can draw its own
// pixel widgets. Every parser returns null when the markup doesn't look as expected;
// the template then falls back to inlining the raw SVG.
import { parse } from 'node-html-parser';

const LANGUAGE_BLOCKS = 20;
const MOSAIC_CELLS = 40;
const ACHIEVEMENT_BLOCKS = 10;
const ICON_STROKE_SCALE = 1.5; // 2-unit strokes on a 60-unit icon get lost on a 22px pixel grid

// Mirrors the .ach-* --rank colors in template/styles.css (Dracula palette).
const RANK_COLORS = { s: '#ff79c6', a: '#8be9fd', b: '#50fa7b', c: '#f8f8f2', x: '#6272a4', secret: '#ffb86c' };
const SHADE_BASE = '#191a21';
const GAUGE_LENGTH = 155;

const STAT_LABELS = [
    [/commits/i, 'COMMITS'],
    [/reviewed/i, 'PR REVIEWS'],
    [/pull requests opened/i, 'PRS OPENED'],
    [/issues opened/i, 'ISSUES'],
    [/comments/i, 'COMMENTS'],
    [/organizations/i, 'ORGS'],
    [/following/i, 'FOLLOWING'],
    [/sponsoring/i, 'SPONSORING'],
    [/starred/i, 'STARRED'],
    [/watching/i, 'WATCHING'],
];

// gh-metrics emits self-closing `<style/>` tags; an HTML parser treats those as an
// opening <style> and swallows the rest of the document as CSS text.
const load = (svg) => parse(svg.replace(/<(style|script)\b[^>]*\/>/gi, ''));

const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));

// Dracula accents for the language graph, in fallback (rank) order.
const DRACULA_LANG_COLORS = ['#bd93f9', '#ff79c6', '#8be9fd', '#50fa7b', '#f1fa8c', '#ffb86c', '#ff5555', '#6272a4'];
const LOW_SATURATION_PENALTY = 20; // keeps vivid blues (TS) from grabbing the dull comment blue before cyan

const hsl = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
    }
    return { hue: (h * 60 + 360) % 360, sat };
};

const hueDistance = (from, to) => {
    const a = hsl(from);
    const b = hsl(to);
    const diff = Math.abs(a.hue - b.hue);
    return Math.min(diff, 360 - diff) + (b.sat < 0.35 ? LOW_SATURATION_PENALTY : 0);
};

// Gives each language (in usage order) the nearest still-free Dracula color, so it keeps
// its identity (Kotlin purple, JS yellow, ...). Once all are taken, colors repeat by rank.
function draculaLanguageColors(colors) {
    const free = new Set(DRACULA_LANG_COLORS);
    return colors.map((color, rank) => {
        if (!free.size) return DRACULA_LANG_COLORS[rank % DRACULA_LANG_COLORS.length];
        const best = [...free].sort((a, b) => hueDistance(color, a) - hueDistance(color, b))[0];
        free.delete(best);
        return best;
    });
}

// Standalone, pixelation-ready copy of an achievement icon: thicker strokes, and its
// colors swapped for two tones of the rank color (lightest -> rank, others -> darker shade).
function pixelIconSrc(svg, rank) {
    const rankColor = RANK_COLORS[rank] || RANK_COLORS.c;
    const colors = [...new Set([...svg.matchAll(/(?:stroke|fill)="(#[0-9a-f]{3,6})"/gi)].map((m) => m[1].toLowerCase()))]
        .sort((a, b) => luminance(b) - luminance(a));
    let out = svg
        .replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${Number(w) * ICON_STROKE_SCALE}"`)
        .replace(/(<svg\b[^>]*?)\s(width|height)="\d+"/, '$1')
        .replace(/(<svg\b[^>]*?)\s(width|height)="\d+"/, '$1')
        .replace(/<svg\b/, '<svg width="60" height="60"');
    colors.forEach((color, i) => {
        const target = i === 0 ? rankColor : mix(rankColor, SHADE_BASE, 0.5);
        out = out.replace(new RegExp(`(stroke|fill)="${color}"`, 'gi'), `$1="${target}"`);
    });
    return `data:image/svg+xml;base64,${Buffer.from(out).toString('base64')}`;
}

const clean = (text) => text.replace(/\s+/g, ' ').trim();
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const blocks = (ratio, count) =>
    Array.from({ length: count }, (_, i) => ({ on: i < Math.round(clamp01(ratio) * count) }));

const safe = (fn) => (svg) => {
    try {
        return fn(svg);
    } catch (error) {
        console.warn(`parse-metrics: ${fn.name} failed: ${error.message}`);
        return null;
    }
};

function parseStats(svg) {
    const root = load(svg);
    const items = root
        .querySelectorAll('div.field')
        .map((node) => {
            const text = clean(node.text);
            const match = text.match(/-?\d[\d,.]*/);
            if (!match) return null;
            const value = Number(match[0].replace(/,/g, ''));
            const known = STAT_LABELS.find(([re]) => re.test(text));
            const label = known ? known[1] : clean(text.replace(match[0], '')).toUpperCase();
            return { value: match[0], label, zero: value === 0 };
        })
        .filter(Boolean);
    return items.length ? items : null;
}

// Hands out `cells` slots in proportion to `weights` (largest remainder method).
function apportion(weights, cells) {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => (w / total) * cells);
    const counts = raw.map(Math.floor);
    let left = cells - counts.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - Math.floor(r), i])
        .sort((a, b) => b[0] - a[0])
        .forEach(([, i]) => {
            if (left > 0) {
                counts[i]++;
                left--;
            }
        });
    return counts;
}

function parseLanguages(svg) {
    const root = load(svg);
    const heading = root.querySelector('h2');
    const total = heading ? (clean(heading.text).match(/\d+/) || [null])[0] : null;

    const bar = root.querySelector('svg.bar');
    const barWidth = Number(bar?.getAttribute('width')) || 460;
    const widthsByColor = new Map();
    for (const rect of bar ? bar.querySelectorAll('rect[mask]') : []) {
        const color = (rect.getAttribute('fill') || '').toLowerCase();
        const width = Number(rect.getAttribute('width')) || 0;
        if (!width) continue;
        if (!widthsByColor.has(color)) widthsByColor.set(color, []);
        widthsByColor.get(color).push(width);
    }

    const items = root
        .querySelectorAll('.field.language.details')
        .map((node) => {
            const nameNode = node.querySelector('.field');
            const path = node.querySelector('path[fill]');
            if (!nameNode || !path) return null;
            const color = path.getAttribute('fill');
            const width = widthsByColor.get(color.toLowerCase())?.shift() ?? 0;
            const percent = (width / barWidth) * 100;
            return {
                name: clean(nameNode.text),
                color,
                size: clean(node.querySelector('small')?.text || ''),
                percent,
                percentLabel: percent >= 10 ? percent.toFixed(1) : percent.toFixed(2),
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.percent - a.percent);

    if (!items.length) return null;

    draculaLanguageColors(items.map((item) => item.color)).forEach((color, i) => {
        items[i].githubColor = items[i].color;
        items[i].color = color;
    });

    const top = items[0].percent || 1;
    items.forEach((item) => {
        // scaled to the leader so the biggest language fills its whole row
        item.blocks = blocks(item.percent / top, LANGUAGE_BLOCKS);
    });

    const counts = apportion(items.map((i) => i.percent), MOSAIC_CELLS);
    const mosaic = items.flatMap((item, i) => Array.from({ length: counts[i] }, () => ({ color: item.color })));

    return { total: total ?? String(items.length), items, mosaic };
}

function parseAchievements(svg) {
    const root = load(svg);
    const items = root
        .querySelectorAll('.achievement')
        .map((node, index) => {
            const rank = ['secret', 's', 'a', 'b', 'c', 'x'].find((r) => node.classList.contains(r)) || 'c';
            const titleNode = node.querySelector('.title');
            if (!titleNode) return null;
            const title = clean(
                titleNode.childNodes
                    .filter((child) => child.nodeType === 3)
                    .map((child) => child.text)
                    .join(' '),
            );
            const arc = node.querySelector('.gauge-arc');
            const dash = Number((arc?.getAttribute('stroke-dasharray') || '0').split(/\s+/)[0]) || 0;
            const progress = clamp01(dash / GAUGE_LENGTH);

            const icon = node.querySelector('.icon > svg');
            let iconHtml = '';
            let iconSrc = '';
            if (icon) {
                icon.querySelectorAll('svg.gauge, defs').forEach((n) => n.remove());
                icon.querySelectorAll('[mask]').forEach((n) => n.removeAttribute('mask'));
                icon.setAttribute('width', '40');
                icon.setAttribute('height', '40');
                iconHtml = icon.toString().replace(/\bid="([^"]+)"/g, `id="ach${index}-$1"`);
                iconSrc = pixelIconSrc(icon.toString(), rank);
            }

            return {
                rank,
                rankLabel: rank === 'secret' ? '★' : rank.toUpperCase(),
                prefix: clean(titleNode.querySelector('.prefix')?.text || ''),
                title,
                // secret achievements carry a decorative star instead of a count
                value: (clean(node.querySelector('.value')?.text || '').match(/^\d[\d.,]*\w?$/) || [''])[0],
                progress,
                blocks: blocks(progress, ACHIEVEMENT_BLOCKS),
                icon: iconHtml,
                iconSrc,
            };
        })
        .filter((item) => item && item.title);
    return items.length ? items : null;
}

export const parsers = {
    stats: safe(parseStats),
    languages: safe(parseLanguages),
    achievements: safe(parseAchievements),
};

export function parseAll({ activity, community, languages, achievements }) {
    return {
        activityData: parsers.stats(activity),
        communityData: parsers.stats(community),
        languageData: parsers.languages(languages),
        achievementData: parsers.achievements(achievements),
    };
}
