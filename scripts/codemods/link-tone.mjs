#!/usr/bin/env node
/**
 * Link tone: no blue links and no hover underlines; rows tint on hover instead.
 * The tokens and utilities live in globals.css ("Link tone"): --link/--link-hover, --tint-hover, --focus-ring,
 * .text-link (text links and text buttons), .body-link (URLs and mentions inside post bodies),
 * .row-link (rows and cards without their own hover background).
 *   node scripts/codemods/link-tone.mjs          # rewrite src/ (safe to rerun)
 *   node scripts/codemods/link-tone.mjs --check  # exit 1 if a blue link or hover underline is back
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// file-specific rewrites first (non-links and body text), then the general ones
const SPECIFIC = {
  'src/components/shell/right-rail.tsx': [
    [/text-\[11px\] text-c-06c mt-0\.5/g, 'text-[11px] text-n-888 mt-0.5'], // '#… 관심사 기반' is a reason label, not a link
    [/className="block group"/g, 'className="row-link group"'],
    [/className="flex items-center gap-2\.5 group min-h-\[44px\]"/g, 'className="row-link flex items-center gap-2.5 group min-h-[44px]"'],
  ],
  'src/components/timeline/mention-text.tsx': [[/mention text-c-06c hover:underline/g, 'mention body-link']],
  'src/components/timeline/post-card.tsx': [[/text-sm text-c-06c hover:underline max-w-full/g, 'text-sm body-link max-w-full']],
  // 내 AI recent rows: the inline background beat the hover background, so the underline was the only hover cue
  'src/components/profile/agents-section.tsx': [
    [/className="block rounded-xl px-3 py-2 hover:bg-n-f7f7f7" style=\{\{ background: 'var\(--n-fafafa\)' \}\}/g, 'className="block rounded-xl px-3 py-2 bg-n-fafafa hover:bg-tint-hover"'],
  ],
  'src/app/(app)/me/page.tsx': [[/className="clamp-2 text-\[13px\] text-n-444 hover:underline"/g, 'className="clamp-2 text-[13px] text-n-444 hover:text-n-111"']],
}
const GENERAL = [
  // blue text links → the link token
  [/\btext-c-06c hover:underline\b/g, 'text-link'],
  [/\btext-c-06c\b/g, 'text-link'],
  // hover underlines: muted text gets a stronger colour instead; names and titles already at full strength keep just the row tint
  [/\btext-n-(555|777) hover:underline\b/g, 'text-n-$1 hover:text-n-111'],
  [/ (group-)?hover:underline\b/g, ''],
  [/ disabled:no-underline\b/g, ''],
]
const SKIP = new Set(['src/components/ui/button.tsx', 'src/components/ui/badge.tsx']) // shadcn 'link' variants, unused
const BAD = [/\btext-c-06c\b/, /\bhover:underline\b/]

const files = execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts'", { encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.has(f))
const check = process.argv.includes('--check')
let changed = 0
const left = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (check) {
    for (const re of BAD) if (re.test(src)) left.push(`${f}: ${re}`)
    continue
  }
  let out = src
  for (const [re, to] of [...(SPECIFIC[f] ?? []), ...GENERAL]) out = out.replace(re, to)
  if (out !== src) { writeFileSync(f, out); changed++ }
}
if (check) {
  if (left.length) { console.error('link tone regressions:\n  ' + left.join('\n  ')); process.exit(1) }
  console.log('link tone clean')
} else console.log(`rewrote ${changed} files`)
