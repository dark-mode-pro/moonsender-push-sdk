// Bundle-size gate: fails CI when a shipped artifact's gzip size crosses its ceiling. Ceilings
// are deliberately generous — this catches an accidentally bundled dependency, not byte golf.
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const LIMITS = {
  'dist/index.mjs': 10_000,
  'dist/index.global.js': 12_000,
  'dist/sw.js': 10_000,
}

let failed = false
for (const [file, limit] of Object.entries(LIMITS)) {
  const gz = gzipSync(readFileSync(file)).length
  const ok = gz <= limit
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${gz} B gzip (limit ${limit})`)
  if (!ok) failed = true
}

if (failed) process.exit(1)
