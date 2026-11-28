// Turns every img[data-pixelate] into a chunky pixel sprite: downsample to GRID×GRID,
// hard alpha, a reduced 216-color palette, and a 1px dark outline, then upscale
// without smoothing. Images that fail (e.g. cross-origin fallbacks) stay as they are.
// Sets body[data-pixelated] when done so Puppeteer knows it can take the screenshot.
// Per image: data-grid (default 20) and data-scale (default 4). Pick them so
// (grid + 2) * scale = 2 * the CSS size, e.g. (20 + 2) * 4 = 88 -> 44px at deviceScaleFactor 2.
(() => {
    const PAD = 1;
    const LEVELS = 6;
    const OUTLINE = [25, 26, 33]; // Dracula darker bg #191a21

    const snap = (v) => Math.round((v / 255) * (LEVELS - 1)) * (255 / (LEVELS - 1));

    const loaded = (img) =>
        img.complete && img.naturalWidth
            ? Promise.resolve()
            : new Promise((resolve, reject) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', reject, { once: true });
            });

    function pixelate(img) {
        const GRID = Number(img.dataset.grid) || 20;
        const SCALE = Number(img.dataset.scale) || 4;
        const SIZE = GRID + PAD * 2;
        const small = document.createElement('canvas');
        small.width = small.height = SIZE;
        const ctx = small.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, PAD, PAD, GRID, GRID);

        const image = ctx.getImageData(0, 0, SIZE, SIZE); // throws for tainted images
        const px = image.data;
        const solid = new Uint8Array(SIZE * SIZE);
        for (let i = 0; i < SIZE * SIZE; i++) {
            const o = i * 4;
            if (px[o + 3] >= 96) {
                solid[i] = 1;
                px[o] = snap(px[o]);
                px[o + 1] = snap(px[o + 1]);
                px[o + 2] = snap(px[o + 2]);
                px[o + 3] = 255;
            } else {
                px[o + 3] = 0;
            }
        }
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const i = y * SIZE + x;
                if (solid[i]) continue;
                const touches =
                    (x > 0 && solid[i - 1]) || (x < SIZE - 1 && solid[i + 1]) ||
                    (y > 0 && solid[i - SIZE]) || (y < SIZE - 1 && solid[i + SIZE]);
                if (touches) {
                    const o = i * 4;
                    [px[o], px[o + 1], px[o + 2]] = OUTLINE;
                    px[o + 3] = 255;
                }
            }
        }
        ctx.putImageData(image, 0, 0);

        const big = document.createElement('canvas');
        big.width = big.height = SIZE * SCALE;
        big.className = img.className;
        big.setAttribute('aria-label', img.alt);
        const bctx = big.getContext('2d');
        bctx.imageSmoothingEnabled = false;
        bctx.drawImage(small, 0, 0, big.width, big.height);
        img.replaceWith(big);
    }

    async function run() {
        const icons = [...document.querySelectorAll('img[data-pixelate]')];
        await Promise.all(
            icons.map(async (img) => {
                try {
                    await loaded(img);
                    pixelate(img);
                } catch (error) {
                    console.warn('pixelate: kept original icon', img.alt, error && error.message);
                }
            }),
        );
        document.body.dataset.pixelated = 'done';
    }

    run();
})();
