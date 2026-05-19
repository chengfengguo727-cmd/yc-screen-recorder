import { unlink } from 'fs/promises'

/**
 * Unlink with retry — handles Windows' lazy handle release where a file may
 * still be locked briefly after the writer/reader exits.
 */
export async function unlinkWithRetry(path: string, attempts = 6): Promise<boolean> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await unlink(path)
      return true
    } catch (e) {
      lastErr = e
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return true
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') return false
      // Exponential-ish backoff: 100, 200, 400, 600, 800, 1000ms
      const wait = Math.min(1000, 100 * Math.pow(2, i))
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  console.warn('unlinkWithRetry exhausted attempts for', path, lastErr)
  return false
}
