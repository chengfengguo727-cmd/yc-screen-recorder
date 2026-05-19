import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, stat, unlink, rename } from 'fs/promises'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import https from 'https'
import http from 'http'

export interface WhisperModelInfo {
  key: string
  filename: string
  url: string
  sizeBytes: number
  description: string
}

export const MODELS: Record<string, WhisperModelInfo> = {
  'base': {
    key: 'base',
    filename: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    sizeBytes: 148_000_000,
    description: 'base 多語（~148 MB，速度快，品質普通）'
  },
  'small': {
    key: 'small',
    filename: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    sizeBytes: 488_000_000,
    description: 'small 多語（~488 MB，品質較好）'
  }
}

export const DEFAULT_MODEL_KEY = 'base'

export function getWhisperDir(): string {
  return join(app.getPath('userData'), 'whisper')
}

export function getModelPath(key: string): string {
  const info = MODELS[key]
  if (!info) throw new Error(`Unknown model ${key}`)
  return join(getWhisperDir(), info.filename)
}

export async function getInstalledModels(): Promise<{ key: string; path: string; sizeBytes: number }[]> {
  const dir = getWhisperDir()
  if (!existsSync(dir)) return []
  const out: { key: string; path: string; sizeBytes: number }[] = []
  for (const key of Object.keys(MODELS)) {
    const p = getModelPath(key)
    if (existsSync(p)) {
      const st = await stat(p)
      if (st.size > 1_000_000) out.push({ key, path: p, sizeBytes: st.size })
    }
  }
  return out
}

export class WhisperDownloader extends EventEmitter {
  private aborted = false

  abort(): void {
    this.aborted = true
  }

  async download(key: string): Promise<string> {
    const info = MODELS[key]
    if (!info) throw new Error(`Unknown model ${key}`)
    const dir = getWhisperDir()
    await mkdir(dir, { recursive: true })
    const dest = join(dir, info.filename)
    const tmp = dest + '.part'
    if (existsSync(tmp)) await unlink(tmp).catch(() => {})

    await this.streamToFile(info.url, tmp, info.sizeBytes)
    if (this.aborted) {
      await unlink(tmp).catch(() => {})
      throw new Error('Download cancelled')
    }
    await rename(tmp, dest)
    this.emit('done', dest)
    return dest
  }

  private streamToFile(url: string, dest: string, expectedSize: number, depth = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (depth > 5) return reject(new Error('Too many redirects'))
      const lib = url.startsWith('https') ? https : http
      const req = lib.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          this.streamToFile(res.headers.location, dest, expectedSize, depth + 1).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const totalBytes = Number(res.headers['content-length']) || expectedSize
        let received = 0
        const file = createWriteStream(dest)
        res.on('data', (chunk: Buffer) => {
          if (this.aborted) {
            req.destroy()
            file.destroy()
            return
          }
          received += chunk.length
          this.emit('progress', { received, total: totalBytes })
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
        res.on('error', reject)
      })
      req.on('error', reject)
    })
  }
}
