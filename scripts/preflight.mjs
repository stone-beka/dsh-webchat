#!/usr/bin/env node
// preflight.mjs — runs automatically before `npm publish` (prepublishOnly).
// It validates the ARTIFACT THAT USERS WILL ACTUALLY GET (the packed tarball),
// not just the working tree. Exit 1 blocks the publish.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// npm is a .cmd on Windows, so spawn the CLI through node itself instead of the PATH shim.
// Strip lifecycle-injected npm_config_* that would turn our nested pack into a no-op
// (under `npm publish --dry-run`, npm_config_dry_run=true is inherited by children).
const npmEnv = { ...process.env }
for (const k of Object.keys(npmEnv)) {
  if (/^npm_config_(dry_run|json|pack_destination|global|workspace|prefix)$/i.test(k)) delete npmEnv[k]
}
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const runNpm = args => execFileSync(process.execPath, [npmCli, ...args], { encoding: 'utf8', env: npmEnv })

const BOM = [0xef, 0xbb, 0xbf]
const fail = msg => { console.error('✗ PREFLIGHT: ' + msg); process.exit(1) }
const ok = msg => console.log('✓ ' + msg)
const readHead = file => fs.readFileSync(file).subarray(0, 3)

function assertNoBom(file, label = file) {
  const b = readHead(file)
  if (b.length >= 3 && b[0] === BOM[0] && b[1] === BOM[1] && b[2] === BOM[2]) {
    fail(`${label} starts with UTF-8 BOM (EF BB BF) — DSH rejects it with "Unexpected token"`)
  }
}

// 1) manifest must parse exactly the way DSH parses it: JSON.parse on raw bytes
const raw = fs.readFileSync('package.json')
assertNoBom('package.json')
let pkg
try { pkg = JSON.parse(raw.toString('utf8')) } catch (e) { fail(`package.json is not valid JSON: ${e.message}`) }
ok(`package.json parses as JSON (${pkg.name}@${pkg.version})`)

// 2) publish-safety of the manifest itself
if (pkg.private === true) fail('package.json has "private": true — npm will refuse to publish')
if (pkg.name.includes('@local/')) fail(`name "${pkg.name}" is a local placeholder, not a publishable name`)
if (!Array.isArray(pkg.files) || pkg.files.length === 0) fail('package.json has no "files" whitelist')
ok(`name/version/private/files OK (${pkg.files.length} entries)`)

// 3) every text file npm will ship must be BOM-free and parseable
for (const rel of ['cordis.patch.yml', 'README.md', 'NOTICE.md', 'icon.svg']) {
  if (fs.existsSync(rel)) assertNoBom(rel)
}
for (const f of fs.readdirSync('locale').filter(f => f.endsWith('.json'))) {
  const p = path.join('locale', f)
  assertNoBom(p)
  try { JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { fail(`${p} is not valid JSON: ${e.message}`) }
}
ok('published text files are BOM-free; locale JSON parses')

// 4) pack the real tarball into a temp dir and inspect it
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-webchat-pack-'))
let tgz
try {
  const out = runNpm(['pack', '--json', '--pack-destination', tmp])
  const info = JSON.parse(out)[0]
  tgz = path.join(tmp, info.filename)
  const shipped = (info.files || []).map(f => (typeof f === 'string' ? f : f.path))
  const count = info.entryCount ?? shipped.length
  ok(`packed ${info.filename} (${count} files, ${(info.size / 1024).toFixed(0)} KB)`)
  for (const need of ['package.json', 'index.js', 'client.js',
    'cordis.patch.yml', 'dist/index.html', 'NOTICE.md', 'README.md']) {
    if (!shipped.includes(need)) fail(`tarball is missing ${need}`)
  }
  ok('tarball contains manifest, entry points, dist and NOTICE')

  // the exact bytes npm will serve
  execFileSync('tar', ['-xzf', tgz, '-C', tmp, 'package/package.json'])
  const packedPath = path.join(tmp, 'package/package.json')
  assertNoBom(packedPath, 'packed package.json')
  const packed = JSON.parse(fs.readFileSync(packedPath, 'utf8'))
  if (packed.version !== pkg.version) fail(`packed version ${packed.version} ≠ working version ${pkg.version}`)
  ok(`packed package.json is BOM-free, parses, version ${packed.version}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\nPREFLIGHT PASSED — ${pkg.name}@${pkg.version} is safe to publish.`)
