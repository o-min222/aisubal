#!/usr/bin/env node
/**
 * R2 codemod: the mock switch is `isMock()` everywhere; the `useMockData` name and its aliases go.
 * It is not a React hook, and the `use` prefix made react-hooks lint treat every call as one.
 *   node scripts/codemods/r2-is-mock.mjs          # rewrite src/ and tests/ in place (safe to rerun)
 *   node scripts/codemods/r2-is-mock.mjs --check  # exit 1 if any useMockData is left
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx' 'tests/**/*.ts' 'scripts/**/*.mjs'", { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.endsWith('r2-is-mock.mjs'))
const check = process.argv.includes('--check')
let changed = 0
const left = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (!src.includes('useMockData')) continue
  if (check) {
    left.push(f)
    continue
  }
  const out = src
    .replace(/\buseMockData as isMock\b/g, 'isMock') // import { useMockData as isMock } → import { isMock }
    .replace(/\bexport function useMockData\(/g, 'export function isMock(')
    .replace(/\buseMockData\b/g, 'isMock') // direct imports, re-exports and calls
  if (out !== src) {
    writeFileSync(f, out)
    changed++
  }
}
if (check) {
  if (left.length) {
    console.error('useMockData still used in:\n  ' + left.join('\n  '))
    process.exit(1)
  }
  console.log('no useMockData left')
} else console.log(`rewrote ${changed} files`)
