#!/usr/bin/env node
// preflight-selftest.mjs — proves the preflight gate actually blocks the bug that shipped 0.2.2.
// Usage: node scripts/preflight-selftest.mjs   (exit 0 = the gate works)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.json')
const preflight = path.join(root, 'scripts', 'preflight.mjs')

const run = () => spawnSync(process.execPath, [preflight], { cwd: root, encoding: 'utf8' })

const fail = msg => { console.error('✗ SELFTEST: ' + msg); process.exit(1) }

// 1) clean tree must pass
const clean = run()
if (clean.error) fail('could not run preflight: ' + clean.error.message)
if (clean.status !== 0) fail('preflight rejects the current package:\n' + (clean.stdout || '') + (clean.stderr || ''))

// 2) a BOM must be rejected
const backup = fs.readFileSync(pkgPath)
try {
  fs.writeFileSync(pkgPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), backup]))
  const withBom = run()
  if (withBom.status === 0) fail('preflight PASSED a package.json that starts with a UTF-8 BOM — the gate is broken')
  if (!/BOM/i.test(withBom.stderr + withBom.stdout)) fail('preflight failed for some other reason: ' + withBom.stderr)
  console.log('✓ BOM injection was rejected')
} finally {
  fs.writeFileSync(pkgPath, backup)
}

// 3) restoring must pass again
const restored = run()
if (restored.status !== 0) fail('preflight still fails after restoring package.json:\n' + restored.stdout + restored.stderr)

console.log('✓ SELFTEST PASSED — clean tree passes, BOM is blocked, restore is clean')
