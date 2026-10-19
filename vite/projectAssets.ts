import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-server plugin that keeps a deck's images in the project as plain files
 * under `public/assets/` (one folder = one slideshow), so they can be
 * committed next to the deck JSON. The browser can't write to disk itself, so:
 *
 * - `GET  /__cuecard/assets`             lists the images in public/assets
 * - `POST /__cuecard/assets?name=x.png`  writes the request body there and
 *   returns `{ url: '/assets/x.png' }` (identical content reuses the existing
 *   file; a different file with the same name gets a `-2`, `-3`… suffix)
 * - `GET  /assets/*`                     serves the files straight from disk,
 *   so a just-written image loads before Vite's public-dir watcher sees it
 *
 * `CUECARD_ASSETS_DIR` points it at another folder (the e2e tests use a
 * throwaway one so they never write into the project).
 */

const API = '/__cuecard/assets';
const URL_PREFIX = '/assets/';
const MAX_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/** A safe file name (no directories, no odd characters) with an image extension. */
export function sanitizeAssetName(name: string): string | null {
  const base = path.basename(name.replace(/\\/g, '/')).normalize('NFC');
  const ext = path.extname(base).toLowerCase();
  if (!(ext in IMAGE_TYPES)) return null;
  const stem = base
    .slice(0, -ext.length)
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return `${stem || 'image'}${ext}`;
}

async function readBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BYTES) throw new Error('Image is too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Writes `data` as `name` in `dir`, reusing an identical file or picking a free
 * name. The data goes to a temp file first and is hard-linked into place, so a
 * name only ever appears with complete contents (concurrent saves of the same
 * image can't see a half-written file and create a duplicate).
 */
async function writeAsset(dir: string, name: string, data: Buffer): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  const temp = path.join(dir, `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.writeFile(temp, data);
  try {
    for (let i = 1; ; i++) {
      const candidate = i === 1 ? name : `${stem}-${i}${ext}`;
      const file = path.join(dir, candidate);
      try {
        await fs.link(temp, file);
        return candidate;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const existing = await fs.readFile(file);
        if (existing.equals(data)) return candidate;
      }
    }
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

/**
 * Only the app itself may write: blocks other sites' no-cors POSTs (which skip
 * CORS preflight) from dropping files, e.g. scripted SVGs, into the project.
 */
function isSameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined) return site === 'same-origin';
  const origin = req.headers.origin;
  return origin === undefined || new URL(origin).host === req.headers.host;
}

async function listAssets(dir: string, sub = ''): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const entry of entries) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...(await listAssets(dir, rel)));
    else if (path.extname(entry.name).toLowerCase() in IMAGE_TYPES) result.push(rel);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function encodeAssetPath(rel: string): string {
  return URL_PREFIX + rel.split('/').map(encodeURIComponent).join('/');
}

export function projectAssets(): Plugin {
  let dir = '';
  return {
    name: 'cuecard-project-assets',
    apply: 'serve',
    configResolved(config) {
      dir = path.resolve(
        config.root,
        process.env.CUECARD_ASSETS_DIR || path.join(config.publicDir || path.join(config.root, 'public'), 'assets')
      );
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          if (url.pathname === API && req.method === 'GET') {
            const files = await listAssets(dir);
            send(200, { files: files.map((name) => ({ name, url: encodeAssetPath(name) })) });
            return;
          }
          if (url.pathname === API && req.method === 'POST') {
            if (!isSameOrigin(req)) return send(403, { error: 'Cross-origin writes are not allowed' });
            const name = sanitizeAssetName(url.searchParams.get('name') ?? '');
            if (!name) return send(400, { error: 'Not an image file name' });
            const saved = await writeAsset(dir, name, await readBody(req));
            send(200, { url: encodeAssetPath(saved) });
            return;
          }
          if (url.pathname.startsWith(URL_PREFIX) && (req.method === 'GET' || req.method === 'HEAD')) {
            let rel: string | null = null;
            try {
              rel = decodeURIComponent(url.pathname.slice(URL_PREFIX.length));
            } catch {
              // Malformed escape: not one of ours
            }
            const file = rel === null ? '' : path.resolve(dir, rel);
            const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
            if (rel !== null && type && file.startsWith(dir + path.sep)) {
              const data = await fs.readFile(file).catch(() => null);
              if (data) {
                res.setHeader('Content-Type', type);
                res.setHeader('Cache-Control', 'no-cache');
                // Images only: an SVG opened directly must not run scripts on the app origin
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Content-Security-Policy', "sandbox; script-src 'none'");
                res.end(req.method === 'HEAD' ? undefined : data);
                return;
              }
            }
          }
        } catch (e) {
          send(500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }
        next();
      });
    },
  };
}
