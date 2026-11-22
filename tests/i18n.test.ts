import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LOCALE, LOCALES, isLocale, localeFromAcceptLanguage } from '@/i18n/config'
import { DICTS } from '@/i18n/dict'
import { interpolate, makeT, msg } from '@/i18n/translate'
import { PLEDGE_EN, PLEDGE_KO, SLOGAN, pledgeTextFor } from '@/lib/pledge'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!p.includes(join('i18n', 'dict'))) walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const ENTITIES: Record<string, string> = { '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&middot;': '·', '&rarr;': '→', '&hellip;': '…' }

/** Every Korean source string the UI translates: t/tr/tx/tn/st/msg('…') and <T>…</T> / <T s="…">. */
function sourceKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  const patterns: Array<[RegExp, 'js' | 'jsx']> = [
    [/\b(?:t|tr|tx|tn|st|msg|m)\(\s*'((?:[^'\\\n]|\\.)*[가-힣](?:[^'\\\n]|\\.)*)'/g, 'js'],
    [/\b(?:t|tr|tx|tn|st|msg|m)\(\s*"((?:[^"\\\n]|\\.)*[가-힣](?:[^"\\\n]|\\.)*)"/g, 'js'],
    [/<T>([^<{]*[가-힣][^<{]*)<\/T>/g, 'jsx'],
    [/<T s="([^"]*[가-힣][^"]*)"/g, 'js'],
  ]
  for (const file of walk('src')) {
    if (file.includes(`${join('src', 'app', 'api')}`)) continue
    const s = readFileSync(file, 'utf8')
    for (const [re, kind] of patterns) {
      for (const m of s.matchAll(re)) {
        let k = m[1]
        if (kind === 'jsx') {
          k = k.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
          for (const [e, c] of Object.entries(ENTITIES)) k = k.split(e).join(c)
        } else {
          k = k.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n')
        }
        if (!keys.has(k)) keys.set(k, file)
      }
    }
  }
  return keys
}

describe('locale config', () => {
  it('Korean is the default and every locale has a dictionary slot', () => {
    expect(DEFAULT_LOCALE).toBe('ko')
    for (const l of LOCALES) expect(l in DICTS).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('ja')).toBe(false)
  })
  it('negotiates Accept-Language with q-weights and region tags', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ko;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('ko-KR,ko;q=0.9,en;q=0.5')).toBe('ko')
    expect(localeFromAcceptLanguage('ja-JP,ja;q=0.9,en;q=0.7')).toBe('en')
    expect(localeFromAcceptLanguage('fr;q=0.2, ko;q=0.9')).toBe('ko')
    expect(localeFromAcceptLanguage('ja,fr')).toBeNull()
    expect(localeFromAcceptLanguage('')).toBeNull()
    expect(localeFromAcceptLanguage(null)).toBeNull()
  })
})

describe('translate', () => {
  it('falls back to the Korean source and interpolates', () => {
    const en = makeT('en', { '{n}장 남음': '{n} left' })
    expect(en('{n}장 남음', { n: 2 })).toBe('2 left')
    expect(en('사전에 없는 문장')).toBe('사전에 없는 문장')
    const ko = makeT('ko', null)
    expect(ko('{n}장 남음', { n: 2 })).toBe('2장 남음')
    expect(interpolate('{a}/{b}', { a: 1 })).toBe('1/{b}')
    expect(msg('툴')).toBe('툴')
  })
})

describe('dictionary coverage', () => {
  const keys = sourceKeys()
  it('finds the UI strings', () => {
    expect(keys.size).toBeGreaterThan(400)
    expect(keys.has('내 대시보드')).toBe(true)
    expect(keys.has('{owner}님의 {agent}')).toBe(true)
  })
  for (const locale of LOCALES) {
    const dict = DICTS[locale]
    if (!dict) continue
    it(`${locale} translates every UI string`, () => {
      const missing = [...keys].filter(([k]) => !(k in dict)).map(([k, f]) => `${k}  (${f})`)
      expect(missing).toEqual([])
    })
    it(`${locale} keeps every {placeholder}`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => [...k.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join() !== [...v.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join())
      expect(bad).toEqual([])
    })
  }
})

describe('pledge and slogan in English', () => {
  it('the translation mirrors the authored structure; Korean stays canonical', () => {
    expect(PLEDGE_EN.preamble).toHaveLength(PLEDGE_KO.preamble.length)
    expect(PLEDGE_EN.vows).toHaveLength(PLEDGE_KO.vows.length)
    expect(pledgeTextFor('ko')).toBe(PLEDGE_KO)
    expect(pledgeTextFor('en')).toBe(PLEDGE_EN)
    expect(PLEDGE_EN.vows[0]).toMatch(/^First,/)
    expect(SLOGAN.en).toBe('From the Shadows, Toward the Light.')
    expect(SLOGAN.koTranslated).toMatch(/next chapter of truth and humanity/)
  })
})
