import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

const logo = readFileSync(join(root, 'public', 'logo.svg'));

async function make(size, filename, { bg = '#FFFFFF', padRatio = 0.1 } = {}) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const radius = Math.round(size * 0.18);
  const bgSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` +
      `</svg>`
  );
  const resized = await sharp(logo)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const out = join(iconsDir, filename);
  await sharp(bgSvg)
    .composite([{ input: resized, left: pad, top: pad }])
    .png()
    .toFile(out);
  console.log('wrote', out);
}

await make(192, 'icon-192.png', { bg: '#FFFFFF', padRatio: 0.1 });
await make(512, 'icon-512.png', { bg: '#FFFFFF', padRatio: 0.1 });
await make(192, 'icon-maskable-192.png', { bg: '#006D44', padRatio: 0.2 });
await make(512, 'icon-maskable-512.png', { bg: '#006D44', padRatio: 0.2 });
await make(180, 'apple-touch-icon.png', { bg: '#FFFFFF', padRatio: 0.1 });
await sharp(logo).resize(32, 32).png().toFile(join(iconsDir, 'favicon-32.png'));
console.log('done');
