/**
 * Rasterize brand/mark.svg + brand/wordmark.svg into favicon, PWA, OG, wordmark PNGs,
 * and a preview sheet. Also copies the SVGs into public/.
 *
 *   node scripts/gen-brand-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brand = join(root, 'brand')
const markSvg = readFileSync(join(brand, 'mark.svg'), 'utf8')
const wordSvg = readFileSync(join(brand, 'wordmark.svg'), 'utf8')
const metrics = JSON.parse(readFileSync(join(brand, 'metrics.json'), 'utf8'))
const ink = metrics.ink || '#111111'
const bg = metrics.bg || '#111111'
const aspect = metrics.aspect

function markInner(fill = '#ffffff') {
  const inner = markSvg.replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')
  const vb = /viewBox="([^"]+)"/.exec(markSvg)[1]
  return { inner: inner.replace(/fill="currentColor"/g, `fill="${fill}"`), vb, fill }
}

function appIconSvg(size, { rounded = false, pad = 0.17, background = bg, foreground = '#ffffff' } = {}) {
  const { inner, vb } = markInner(foreground)
  const inset = size * pad
  const innerSize = size - inset * 2
  const r = rounded ? +(size * 0.22).toFixed(2) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${background}"/>
  <svg x="${inset}" y="${inset}" width="${innerSize}" height="${innerSize}" viewBox="${vb}" fill="${foreground}">${inner}</svg>
</svg>`
}

function wordmarkTinted(fill) {
  return wordSvg.replace(/fill="#111111"/, `fill="${fill}"`).replace(/fill="#111"/, `fill="${fill}"`)
}

async function pngFromSvg(svg, { width, height, density = 400 } = {}) {
  let img = sharp(Buffer.from(svg), { density })
  if (width || height) img = img.resize(width, height, { fit: 'fill' })
  return img.png().toBuffer()
}

async function writePng(path, buf) {
  mkdirSync(dirname(path), { recursive: true })
  await sharp(buf).png().toFile(path)
  console.log('wrote', path.replace(root + '/', ''))
}

// public SVGs
copyFileSync(join(brand, 'wordmark.svg'), join(root, 'public/images/logo.svg'))
copyFileSync(join(brand, 'mark.svg'), join(root, 'public/images/logo-mark.svg'))

// favicon.svg — rounded app icon (crisp in tabs)
const { inner, vb } = markInner('#ffffff')
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" ry="7" fill="${bg}"/>
  <svg x="5" y="5" width="22" height="22" viewBox="${vb}" fill="#ffffff">${inner}</svg>
</svg>`
writeFileSync(join(root, 'public/favicon.svg'), faviconSvg)

// Favicon PNG (32) and wordmarks
await writePng(join(root, 'public/favicon.png'), await pngFromSvg(faviconSvg, { width: 32, height: 32, density: 600 }))

// wordmark PNGs at a generous resolution (height 240)
const wordH = 240
const wordW = Math.round(wordH * aspect)
const blackWord = await sharp(Buffer.from(wordmarkTinted(ink)), { density: 400 })
  .resize(wordW, wordH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
const whiteWord = await sharp(Buffer.from(wordmarkTinted('#ffffff')), { density: 400 })
  .resize(wordW, wordH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
await writePng(join(root, 'public/images/logo-black.png'), blackWord)
await writePng(join(root, 'public/images/logo-white.png'), whiteWord)

// PWA / apple / push
const icons = join(root, 'public/icons')
await writePng(join(icons, 'icon-192.png'), await pngFromSvg(appIconSvg(192, { rounded: true, pad: 0.17 }), { width: 192, height: 192 }))
await writePng(join(icons, 'icon-512.png'), await pngFromSvg(appIconSvg(512, { rounded: true, pad: 0.17 }), { width: 512, height: 512 }))
await writePng(
  join(icons, 'icon-maskable-512.png'),
  await pngFromSvg(appIconSvg(512, { rounded: false, pad: 0.22 }), { width: 512, height: 512 }),
)
await writePng(
  join(icons, 'apple-touch-icon.png'),
  await pngFromSvg(appIconSvg(180, { rounded: false, pad: 0.17 }), { width: 180, height: 180 }),
)
// Notification badge: monochrome mark, transparent background
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <svg x="8" y="8" width="80" height="80" viewBox="${vb}" fill="#ffffff">${inner}</svg>
</svg>`
await writePng(join(icons, 'badge.png'), await pngFromSvg(badgeSvg, { width: 96, height: 96 }))

// OG 1200×630
const sloganFont = '/usr/share/fonts/truetype/sand-box/google/Gothic A1/GothicA1-Regular.ttf'
const ogWordW = 720
const ogWordH = Math.round(ogWordW / aspect)
const ogWord = await sharp(Buffer.from(wordmarkTinted('#ffffff')), { density: 400 })
  .resize(ogWordW, ogWordH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
const sloganSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="60">
  <style>@font-face { font-family: Slogan; src: url('file://${sloganFont}'); }</style>
  <text x="600" y="40" text-anchor="middle" font-family="Slogan, sans-serif" font-size="26" fill="rgba(255,255,255,0.62)">From the Shadows, Toward the Light.</text>
</svg>`
const sloganBuf = await sharp(Buffer.from(sloganSvg), { density: 200 }).resize(1200, 60).png().toBuffer()
const og = await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 17, g: 17, b: 17 } } })
  .composite([
    { input: ogWord, top: Math.round((630 - ogWordH) / 2 - 24), left: Math.round((1200 - ogWordW) / 2) },
    { input: sloganBuf, top: Math.round((630 - ogWordH) / 2 - 24 + ogWordH + 16), left: 0 },
  ])
  .png()
  .toFile(join(root, 'public/images/og-default.png'))
console.log('wrote public/images/og-default.png')

console.log('brand icons ok')
