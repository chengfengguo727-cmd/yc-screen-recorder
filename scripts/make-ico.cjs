// Build a multi-resolution Windows .ico from a PNG source.
// Uses FFmpeg (bundled in resources/ffmpeg) to resize to standard sizes,
// then wraps each PNG in the .ico container (PNG-in-ICO since Vista).
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const ffmpeg = path.join(root, 'resources', 'ffmpeg', 'ffmpeg.exe')
const srcPng = path.join(root, 'build', 'icon.png')
const outIco = path.join(root, 'build', 'icon.ico')

const sizes = [16, 24, 32, 48, 64, 128, 256]
const buffers = []

for (const size of sizes) {
  const tmp = path.join(root, 'build', `icon-${size}.png`)
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    srcPng,
    '-vf',
    `scale=${size}:${size}:flags=lanczos`,
    tmp
  ])
  buffers.push({ size, data: fs.readFileSync(tmp) })
  fs.unlinkSync(tmp)
}

// ICO file format
// ICONDIR (6 bytes) + N * ICONDIRENTRY (16 bytes) + N * PNG data
const headerSize = 6
const entrySize = 16
const dirSize = headerSize + entrySize * buffers.length
let imageDataOffset = dirSize

const dir = Buffer.alloc(dirSize)
dir.writeUInt16LE(0, 0) // reserved
dir.writeUInt16LE(1, 2) // type = icon
dir.writeUInt16LE(buffers.length, 4)

buffers.forEach((b, i) => {
  const entryOff = headerSize + i * entrySize
  // width/height: 0 means 256
  dir.writeUInt8(b.size === 256 ? 0 : b.size, entryOff + 0)
  dir.writeUInt8(b.size === 256 ? 0 : b.size, entryOff + 1)
  dir.writeUInt8(0, entryOff + 2) // colors in palette
  dir.writeUInt8(0, entryOff + 3) // reserved
  dir.writeUInt16LE(1, entryOff + 4) // planes
  dir.writeUInt16LE(32, entryOff + 6) // bits per pixel
  dir.writeUInt32LE(b.data.length, entryOff + 8) // size
  dir.writeUInt32LE(imageDataOffset, entryOff + 12) // offset
  imageDataOffset += b.data.length
})

const ico = Buffer.concat([dir, ...buffers.map((b) => b.data)])
fs.writeFileSync(outIco, ico)
console.log(`wrote ${outIco} (${(ico.length / 1024).toFixed(1)} KB, ${buffers.length} sizes)`)
