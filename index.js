/**
 * Host half of the DSH WebChat bundle.
 *
 * Serves the pinned, officially built chat-demo (`dist/`, from the MIT-licensed
 * release archive) from this machine on a loopback port. Serving it here rather
 * than pointing at `cdn.deepseek.com` keeps the page version-locked, independent
 * of a remote CDN's uptime, and outside the Web GUI's own origin — so the demo's
 * script can never read the GUI's session credential or call its API as you.
 *
 * The page talks to `api.deepseek.com` directly, as it was built to: no request
 * passes through this server, and no API key is stored on the Host.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The pinned build, beside this module. */
const DIST = fileURLToPath(new URL('./dist/', import.meta.url))

/** Loopback address and port the panel's iframe points at. */
const HOST = '127.0.0.1'
const PORT = 43117

/** Content types for the files this build contains. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Resolve one request path to a file inside the pinned build.
 * @param url - raw request target.
 * @returns the file to send, or null when nothing in the build matches.
 */
async function resolveFile(url) {
  let pathname
  try {
    pathname = decodeURIComponent((url ?? '/').split('?')[0].split('#')[0])
  } catch {
    return null
  }
  const target = join(DIST, pathname)
  // `join` collapses `..`, so this rejects every escape from the build directory.
  if (!target.startsWith(DIST.endsWith(sep) ? DIST : DIST + sep)) return null
  const info = await stat(target).catch(() => null)
  if (info?.isFile()) return target
  // The build is a single-page app: unknown paths render its index.
  const index = join(DIST, 'index.html')
  const fallback = await stat(index).catch(() => null)
  return fallback?.isFile() ? index : null
}

/** The loopback static server. */
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
    response.end('method not allowed')
    return
  }
  const file = await resolveFile(request.url)
  if (file === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }
  const info = await stat(file).catch(() => null)
  if (info === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }
  // Hashed asset paths never change; the entry document must always be reread.
  const immutable = file.split(sep).includes('static')
  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => { response.destroy() })
  stream.pipe(response)
})

/**
 * Serve the pinned build for as long as this row is active.
 * @param ctx - the Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const onError = (error) => {
      console.warn(`[DSH WebChat] cannot serve http://${HOST}:${PORT}/ — ${error.message}`)
    }
    const onListening = () => {
      console.log(`[DSH WebChat] serving the pinned chat-demo at http://${HOST}:${PORT}/`)
    }
    server.on('error', onError)
    server.once('listening', onListening)
    server.listen(PORT, HOST)
    return () => {
      server.off('error', onError)
      server.off('listening', onListening)
      server.closeAllConnections()
      server.close()
    }
  }, 'dsh-webchat: local static server')
}
