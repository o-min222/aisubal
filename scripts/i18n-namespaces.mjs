#!/usr/bin/env node
/**
 * A149: which English dictionary keys each part of the app ships to the browser.
 *
 * Walks the import graph from every route file under src/app, finds the client modules each
 * area reaches ('use client' boundaries and everything they import), and assigns every key:
 *   - 'server'  only server modules use it (route handlers, OG images, push, server components)
 *   - <area>    only client modules reachable from one area use it (admin, articles, ...)
 *   - 'common'  the root/app layouts' client graph, two or more areas, or no literal use found
 * `node scripts/i18n-namespaces.mjs` prints the plan; `--write` regenerates src/i18n/dict/en/*.ts
 * from the current dictionary. tests/i18n-namespaces.test.ts checks the files match the plan.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const ROUTE_FILES = new Set(['page.tsx', 'page.ts', 'layout.tsx', 'template.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx', 'default.tsx'])
const ENTITIES = { '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&middot;': '·', '&rarr;': '→', '&hellip;': '…' }
const KEY_PATTERNS = [
  [/\b(?:t|tr|tx|tn|st|te|msg|m|M)\(\s*'((?:[^'\\\n]|\\.)*[가-힣](?:[^'\\\n]|\\.)*)'/g, 'js'],
  [/\b(?:t|tr|tx|tn|st|te|msg|m|M)\(\s*"((?:[^"\\\n]|\\.)*[가-힣](?:[^"\\\n]|\\.)*)"/g, 'js'],
  [/<T>([^<{]*[가-힣][^<{]*)<\/T>/g, 'jsx'],
  [/<T s="([^"]*[가-힣][^"]*)"/g, 'js'],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!p.includes(join('i18n', 'dict'))) walk(p, out)
    } else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p)
  }
  return out
}

export function fileKeys(src) {
  const keys = new Set()
  for (const [re, kind] of KEY_PATTERNS) {
    for (const m of src.matchAll(re)) {
      let k = m[1]
      if (kind === 'jsx') {
        k = k.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
        for (const [e, c] of Object.entries(ENTITIES)) k = k.split(e).join(c)
      } else k = k.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n')
      keys.add(k)
    }
  }
  return keys
}

function resolve(from, spec) {
  let base
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

function imports(file, src) {
  const out = []
  // value imports only: `import type` / `export type` never reach the browser
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of src.matchAll(re)) {
    if (m[2]) continue
    const spec = m[3] ?? m[4]
    const r = resolve(file, spec)
    if (r) out.push(r)
  }
  return out
}

/** Area of a route file: first URL segment with route groups stripped; root-level files are 'common'. */
export function areaOf(routeFile) {
  const parts = relative(join(SRC, 'app'), routeFile).split(sep).slice(0, -1).filter((p) => !/^\(.*\)$/.test(p))
  if (parts[0] === 'api') return 'common'
  if (!parts.length) return 'common' // root/app layouts, the landing page, not-found: no segment to hang a layout on
  const a = parts[0]
  return /^\[/.test(a) || a === 'api' ? 'common' : a
}

export function plan(dict) {
  const files = walk(SRC)
  const info = new Map()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    info.set(f, { client: /^\s*['"]use client['"]/.test(src), imports: imports(f, src), keys: fileKeys(src), any: anyKeys(src), serverSide: anyKeys(stripServerT(src)) })
  }
  const routes = files.filter((f) => f.startsWith(join(SRC, 'app') + sep) && ROUTE_FILES.has(f.split(sep).pop()) && !f.includes(join('app', 'api') + sep))
  // JSON the browser fetches can carry Korean labels it translates with t(value) (hover cards,
  // composer previews): API route graphs count as the shell. MCP/setup/cron answer agents, not the UI.
  const apiRoutes = files.filter((f) => f.includes(join('src', 'app', 'api') + sep) && /route\.tsx?$/.test(f) && !/[\\/]api[\\/](mcp|setup|cron)[\\/]/.test(f))
  routes.push(...apiRoutes)
  /** area → keys its browser code can ask for */
  const need = new Map()
  for (const r of routes) {
    const area = areaOf(r)
    const keys = need.get(area) ?? need.set(area, new Set()).get(area)
    const seen = new Set()
    const stack = [[r, false]]
    while (stack.length) {
      const [f, inClient] = stack.pop()
      const id = `${f}|${inClient}`
      if (seen.has(id)) continue
      seen.add(id)
      const i = info.get(f)
      if (!i) continue
      const client = inClient || i.client
      // Client code: every Korean literal (tx('…'), <T>, and plain strings later passed to t(value)).
      // Server code: the same minus what it translates itself with t/st/te(…): <T> is a client
      // component, and labels built on the server (member cards, stats) are translated in the browser.
      for (const k of client ? i.any : i.serverSide) keys.add(k)
      for (const d of i.imports) stack.push([d, client])
    }
  }
  const literal = new Set()
  for (const i of info.values()) for (const k of i.keys) literal.add(k)
  const all = Object.keys(dict)
  // Keys never written as a literal: either built at runtime (SQL-raised messages, strings assembled
  // from parts) — shipped in the shell to be safe — or stale entries whose text no longer exists
  // anywhere in src/ or the migrations, which no browser can ask for (server-only).
  let corpus = [...files.map((f) => readFileSync(f, 'utf8')), ...sqlFiles().map((f) => readFileSync(f, 'utf8'))].join('\n')
  for (const [e, c] of Object.entries(ENTITIES)) corpus = corpus.split(e).join(c)
  corpus = corpus.replace(/\\(['"])/g, '$1').replace(/''/g, "'").replace(/\s+/g, ' ')
  const stale = (k) => {
    const frag = k.split('||')[0].replace(/\s+/g, ' ').split(/\{\w+\}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0] ?? ''
    return frag.length >= 4 && !corpus.includes(frag)
  }
  // the shell: what the root + app layouts reach, plus runtime-built keys
  const shell = new Set(all.filter((k) => need.get('common')?.has(k) || (!literal.has(k) && !stale(k))))
  const ns = { common: [...shell] }
  for (const [area, keys] of need) {
    if (area === 'common') continue
    const own = all.filter((k) => keys.has(k) && !shell.has(k))
    if (own.length) ns[area] = own
  }
  const shipped = new Set(Object.values(ns).flat())
  const serverOnly = all.filter((k) => !shipped.has(k))
  return { ns, serverOnly, areas: [...need.keys()].filter((a) => a !== 'common').sort() }
}

function sqlFiles() {
  const d = join(ROOT, 'supabase', 'migrations')
  return existsSync(d) ? readdirSync(d).filter((n) => n.endsWith('.sql')).map((n) => join(d, n)) : []
}

/** Every Korean string a module could hand to a translator: marked keys plus any plain literal. */
export function anyKeys(src) {
  const out = fileKeys(src)
  for (const re of [/'((?:[^'\\\n]|\\.)*[가-힣](?:[^'\\\n]|\\.)*)'/g, /"((?:[^"\\\n]|\\.)*[가-힣](?:[^"\\\n]|\\.)*)"/g, /`([^`$]*[가-힣][^`$]*)`/g]) {
    for (const m of src.matchAll(re)) out.add(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n'))
  }
  return out
}

/** Server modules translate t/st/te/tr('…') themselves; those literals never reach the browser untranslated. */
function stripServerT(src) {
  return src.replace(/\b(?:t|tr|st|te)\(\s*(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g, '(')
}

/** Directories whose layout must wrap the area: the first URL segment in every route group. */
export function areaDirs(area) {
  const app = join(SRC, 'app')
  const groups = readdirSync(app).filter((n) => /^\(.*\)$/.test(n)).map((n) => join(app, n))
  return [app, ...groups].map((d) => join(d, area)).filter((d) => existsSync(d) && statSync(d).isDirectory())
}

export const AREA_LAYOUT = (area) => `import { I18nArea } from '@/i18n/area'

/** A149: ships the English strings this area's browser code needs (see src/i18n/area.tsx). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <I18nArea area="${area}">{children}</I18nArea>
}
`

export const OUT_DIR = join(SRC, 'i18n', 'dict', 'en-areas')

/** The generated file for one namespace (stable order = en.ts order). */
export function renderNamespace(name, keys, dict) {
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`).join('\n')
  return `// Generated by scripts/i18n-namespaces.mjs --write from en.ts. Do not edit; edit en.ts and regenerate.\n// '${name}': ${keys.length} keys the browser needs ${name === 'common' ? 'on every page' : `under /${name}`}.\nconst dict: Record<string, string> = {\n${body}\n}\nexport default dict\n`
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const { default: en } = await import(pathToFileURL(join(SRC, 'i18n', 'dict', 'en', 'index.ts')).href).catch(async () => import(pathToFileURL(join(SRC, 'i18n', 'dict', 'en.ts')).href))
  const { ns, serverOnly } = plan(en)
  ns['(server only)'] = serverOnly
  const size = (keys) => Buffer.byteLength(JSON.stringify(Object.fromEntries(keys.map((k) => [k, en[k]]))))
  const rows = Object.entries(ns).map(([n, keys]) => [n, keys.length, size(keys)]).sort((a, b) => b[2] - a[2])
  if (process.argv.includes('--write')) {
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })
    for (const [n, keys] of Object.entries(ns)) if (!n.startsWith('(')) writeFileSync(join(OUT_DIR, `${n}.ts`), renderNamespace(n, keys, en))
    console.log(`wrote ${Object.keys(ns).length - 1} files to ${relative(ROOT, OUT_DIR)}`)
    for (const area of Object.keys(ns)) {
      if (area.startsWith('(') || area === 'common') continue
      for (const dir of areaDirs(area)) {
        const f = join(dir, 'layout.tsx')
        if (!existsSync(f)) {
          writeFileSync(f, AREA_LAYOUT(area))
          console.log(`created ${relative(ROOT, f)}`)
        }
      }
    }
  }
  for (const [n, c, b] of rows) console.log(n.padEnd(14), String(c).padStart(5), `${(b / 1024).toFixed(1)} KB`)
  console.log('total'.padEnd(14), String(Object.keys(en).length).padStart(5), `${(size(Object.keys(en)) / 1024).toFixed(1)} KB`)
}
