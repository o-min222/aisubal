import { DEFAULT_LOCALE, type Locale } from './config'

/** Korean source text → translation. Missing entries fall back to the Korean source. */
export type Dict = Readonly<Record<string, string>>
export type Vars = Record<string, string | number>
export type T = (source: string, vars?: Vars) => string

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/**
 * Context marker: '추천||feed tab' is shown as '추천' in Korean but has its own
 * dictionary entry, for a short word whose translation depends on where it sits.
 */
const CTX_SEP = '||'
const stripCtx = (s: string) => {
  const i = s.indexOf(CTX_SEP)
  return i < 0 ? s : s.slice(0, i)
}

export function makeT(locale: Locale, dict: Dict | null): T {
  if (locale === DEFAULT_LOCALE || !dict) return (s, vars) => interpolate(stripCtx(s), vars)
  return (s, vars) => {
    const hit = dict[s]
    if (hit !== undefined) return interpolate(hit, vars)
    if (s.includes(CTX_SEP)) {
      s = stripCtx(s)
      const plain = dict[s]
      if (plain !== undefined) return interpolate(plain, vars)
    }
    // Server messages often arrive already filled with numbers ("500자 이하로 써 주세요.").
    // Retry as a template — digits become {n}, {n2}, … — and put the numbers back.
    const nums: Record<string, string> = {}
    let i = 0
    const key = s.replace(/\d+/g, (d) => {
      const k = i++ ? `n${i}` : 'n'
      nums[k] = d
      return `{${k}}`
    })
    const tpl = i ? dict[key] : undefined
    return tpl !== undefined ? interpolate(tpl, { ...nums, ...vars }) : interpolate(s, vars)
  }
}

/**
 * Marks a Korean source string that is stored now and translated later with
 * t(value) (nav labels, hints, reasons). Identity at runtime; tests/i18n.test.ts
 * collects msg('…') and t('…') literals to check every locale covers them.
 */
export const msg = <S extends string>(s: S): S => s
