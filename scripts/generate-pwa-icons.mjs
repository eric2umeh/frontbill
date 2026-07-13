/**
 * Regenerate PWA / favicon PNGs from public/frontbill-icon.svg (full-bleed, centered).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'public/frontbill-icon.svg')
const iconsDir = path.join(root, 'public/icons')
const BRAND_BLUE = { r: 37, g: 99, b: 235, alpha: 1 }

await mkdir(iconsDir, { recursive: true })

const svg = await sharp(svgPath)

async function writeSquarePng(size, outPath) {
  await svg
    .clone()
    .resize(size, size, { fit: 'fill' })
    .png()
    .toFile(outPath)
}

/** Maskable safe zone (~80% diameter) for Android adaptive icons. */
async function writeMaskablePng(size, outPath) {
  const inner = Math.round(size * 0.8)
  const pad = Math.floor((size - inner) / 2)
  const icon = await svg.clone().resize(inner, inner, { fit: 'fill' }).png().toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BLUE,
    },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toFile(outPath)
}

for (const size of [128, 180, 192, 512]) {
  await writeSquarePng(size, path.join(iconsDir, `icon-${size}.png`))
}
await writeSquarePng(128, path.join(root, 'public/frontbill-favicon.png'))
await writeMaskablePng(512, path.join(iconsDir, 'icon-maskable-512.png'))

console.log('Generated PWA icons in public/icons/ and public/frontbill-favicon.png')
