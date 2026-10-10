#!/usr/bin/env node
/**
 * Generates every brand asset the app and installers need, from a single
 * source image (build/icon-source.png, the Codeon ribbon emblem).
 *
 *   build/icon.png              512x512  master icon (electron-builder / Linux)
 *   build/icon.ico              multi-size Windows icon (installer + exe + taskbar)
 *   resources/icon.png          256x256  runtime icon for the BrowserWindow / tray
 *   src/renderer/src/assets/logo.png        128x128  title-bar mark
 *   src/renderer/src/assets/logo-large.png  256x256  welcome mark
 *   src/renderer/src/assets/logo-512.png    512x512  reusable master
 *
 * The ICO is assembled by hand: Windows Vista+ accepts PNG-compressed frames
 * inside an ICO container, so we can embed resized PNGs directly and avoid a
 * native image dependency.
 *
 * The script is intentionally failure-tolerant. Running it during `postinstall`
 * must never break an install, so any error downgrades to a warning.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'build', 'icon-source.png')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Renderer marks, so the in-app logo always matches the installed icon. */
const RENDERER_ASSETS = [
  { file: join('src', 'renderer', 'src', 'assets', 'logo.png'), size: 128 },
  { file: join('src', 'renderer', 'src', 'assets', 'logo-large.png'), size: 256 },
  { file: join('src', 'renderer', 'src', 'assets', 'logo-512.png'), size: 512 }
]

/**
 * Build a Windows .ico buffer from a list of { size, png } frames.
 * @param {{size:number, png:Buffer}[]} frames
 */
function buildIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(frames.length, 4)

  const directory = Buffer.alloc(16 * frames.length)
  let offset = 6 + 16 * frames.length

  frames.forEach((frame, index) => {
    const entry = 16 * index
    // 0 encodes 256 in the ICO format.
    directory.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry + 0)
    directory.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry + 1)
    directory.writeUInt8(0, entry + 2) // palette count
    directory.writeUInt8(0, entry + 3) // reserved
    directory.writeUInt16LE(1, entry + 4) // color planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(frame.png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += frame.png.length
  })

  return Buffer.concat([header, directory, ...frames.map((f) => f.png)])
}

/** Load Jimp across v1 / v0 export shapes. */
async function loadJimp() {
  const mod = await import('jimp')
  if (mod.Jimp) return mod.Jimp
  if (mod.default && mod.default.read) return mod.default
  throw new Error('Unsupported jimp version')
}

/**
 * Crops the transparent margin around the emblem, so it fills the canvas at
 * small sizes instead of floating in the padding it shipped with.
 */
function trimToContent(image) {
  const { width, height, data } = image.bitmap
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || typeof image.crop !== 'function') return image
  // A hair of padding keeps the rounded corners from touching the canvas edge.
  const pad = 2
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const w = Math.min(width - x, maxX - minX + 1 + pad * 2)
  const h = Math.min(height - y, maxY - minY + 1 + pad * 2)
  image.crop({ x, y, w, h })
  return image
}

/** One square copy of the source image at `size`, as a PNG buffer. */
async function squarePng(image, size) {
  const copy = image.clone()
  // `cover` center-crops to a square so the emblem never gets squashed.
  if (typeof copy.cover === 'function') copy.cover({ w: size, h: size })
  else copy.resize(size, size)
  return Buffer.from(await copy.getBuffer('image/png'))
}

async function renderFrames() {
  const Jimp = await loadJimp()
  const image = trimToContent(await Jimp.read(await readFile(SOURCE)))

  const frames = []
  for (const size of ICO_SIZES) {
    frames.push({ size, png: await squarePng(image, size) })
  }

  const renderer = []
  for (const asset of RENDERER_ASSETS) {
    renderer.push({ file: asset.file, png: await squarePng(image, asset.size) })
  }

  return { frames, masterPng: await squarePng(image, 512), runtimePng: await squarePng(image, 256), renderer }
}

/** Last-resort so packaging still works if image tooling is unavailable. */
async function copyFallback() {
  const raw = await readFile(SOURCE)
  await writeFile(join(root, 'build', 'icon.png'), raw)
  await writeFile(join(root, 'resources', 'icon.png'), raw)
  for (const asset of RENDERER_ASSETS) await writeFile(join(root, asset.file), raw)
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.warn(`[icons] source image missing at ${SOURCE} — skipping icon generation`)
    return
  }

  try {
    await mkdir(join(root, 'resources'), { recursive: true })
    const { frames, masterPng, runtimePng, renderer } = await renderFrames()
    await writeFile(join(root, 'build', 'icon.png'), masterPng)
    await writeFile(join(root, 'build', 'icon.ico'), buildIco(frames))
    await writeFile(join(root, 'resources', 'icon.png'), runtimePng)
    for (const asset of renderer) await writeFile(join(root, asset.file), asset.png)
    console.log(
      `[icons] wrote build/icon.png, build/icon.ico (${frames.length} sizes), resources/icon.png and ${renderer.length} renderer marks`
    )
  } catch (error) {
    console.warn(`[icons] generation failed (${error.message}) — falling back to raw PNG copy`)
    try {
      await copyFallback()
    } catch (fallbackError) {
      console.warn(`[icons] fallback failed too: ${fallbackError.message}`)
    }
  }
}

main()
