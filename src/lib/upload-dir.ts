import path from 'node:path'

// Where creatives are stored on disk (UPLOAD_DIR, default ./uploads). No server-only import: the seed copies
// the prototype's creatives here under tsx. Tests use their own folder (.env.test), never the dev server's.
export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads')
}
