// node scripts/dead-tokens.mjs — exits 1 when a palette token has no reader
// colour tokens (--c-*, --n-*) defined in globals.css but referenced nowhere (var(--x), Tailwind *-x classes, or --color-x use)
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const css = readFileSync('src/app/globals.css', 'utf8')
const defs = [...new Set([...css.matchAll(/^\s*--((?:c|n)-[0-9a-f]+):/gm)].map((m) => m[1]))]
const src = execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts' 'src/**/*.css' 'public/**/*.js' 'public/**/*.json'", { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => readFileSync(f, 'utf8')).join('\n')
const cssNoDefs = css.replace(/^\s*--(?:color-)?(?:c|n)-[0-9a-f]+:.*$/gm, '')
const dead = defs.filter((t) => {
  const uses = new RegExp(`var\\(--(color-)?${t}\\b|[-:]${t}\\b`)
  return !uses.test(cssNoDefs) && !uses.test(src.replace(css, ''))
})
console.log(dead.length, 'dead:', dead.join(' '))
if (dead.length) process.exit(1)
