// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import en from '@/i18n/dict/en'
import { DICTS, SHELL_DICTS } from '@/i18n/dict'
import { I18nExtend, I18nProvider } from '@/i18n/client'
import { T } from '@/i18n/t'
import { plan, renderNamespace, areaDirs, OUT_DIR } from '../scripts/i18n-namespaces.mjs'

type Plan = { ns: Record<string, string[]>; serverOnly: string[] }
const p = plan(en) as Plan
const REGEN = 'run `node scripts/i18n-namespaces.mjs --write` after adding or moving UI strings'

describe('A149 English namespaces', () => {
  it(`generated files match the plan (${REGEN})`, () => {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.ts')).sort()
    expect(files).toEqual(Object.keys(p.ns).map((n) => `${n}.ts`).sort())
    for (const [name, keys] of Object.entries(p.ns)) {
      expect(readFileSync(join(OUT_DIR, `${name}.ts`), 'utf8'), `${name}.ts is stale: ${REGEN}`).toBe(renderNamespace(name, keys, en))
    }
  })

  it('keys stay identical: shell + areas + server-only cover en exactly, with the same values', async () => {
    const shipped = new Set<string>()
    for (const name of Object.keys(p.ns)) {
      const mod = (await import(`@/i18n/dict/en-areas/${name}`)) as { default: Record<string, string> }
      for (const [k, v] of Object.entries(mod.default)) {
        expect(en[k], k).toBe(v)
        shipped.add(k)
      }
    }
    const shellKeys = new Set(p.ns.common)
    for (const [name, keys] of Object.entries(p.ns)) if (name !== 'common') for (const k of keys) expect(shellKeys.has(k), `${k} in shell and ${name}`).toBe(false)
    for (const k of p.serverOnly) expect(shipped.has(k)).toBe(false)
    expect(new Set([...shipped, ...p.serverOnly])).toEqual(new Set(Object.keys(en)))
  })

  it('ko is the source language (no dictionary); the server still translates with the full en', () => {
    expect(DICTS.ko).toBeNull()
    expect(SHELL_DICTS.ko).toBeNull()
    expect(DICTS.en).toBe(en)
    expect(Object.keys(SHELL_DICTS.en ?? {}).sort()).toEqual([...p.ns.common].sort())
  })

  it('every area namespace is loaded by a segment layout in each route group that serves it', () => {
    for (const area of Object.keys(p.ns)) {
      if (area === 'common') continue
      const dirs = areaDirs(area) as string[]
      expect(dirs.length, area).toBeGreaterThan(0)
      for (const d of dirs) {
        const f = join(d, 'layout.tsx')
        expect(existsSync(f), `${f} (${REGEN})`).toBe(true)
        expect(readFileSync(f, 'utf8')).toContain(`<I18nArea area="${area}">`)
      }
    }
    expect(readFileSync('src/app/layout.tsx', 'utf8')).toContain('dict={SHELL_DICTS[locale]}')
  })

  it('an area provider adds its strings on top of the shell; Korean renders the source', () => {
    const tree = (locale: 'en' | 'ko') => (
      <I18nProvider locale={locale} dict={locale === 'en' ? { 셸: 'Shell' } : null}>
        <I18nExtend dict={locale === 'en' ? { 영역: 'Area' } : null}>
          <T>셸</T>|<T>영역</T>|<T>없음</T>
        </I18nExtend>
      </I18nProvider>
    )
    expect(renderToStaticMarkup(tree('en'))).toBe('Shell|Area|없음')
    expect(renderToStaticMarkup(tree('ko'))).toBe('셸|영역|없음')
    // outside the area only the shell applies
    expect(renderToStaticMarkup(<I18nProvider locale="en" dict={{ 셸: 'Shell' }}><T>영역</T></I18nProvider>)).toBe('영역')
  })
})
