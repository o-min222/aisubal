import { getLocale } from './server'
import { I18nExtend } from './client'
import type { Dict } from './translate'

/**
 * A149: a segment layout wraps its subtree in the English namespace for its area, so a page ships
 * the shell (root layout) + its own area instead of the whole 230 KB dictionary. Korean is the
 * source language and needs nothing. Namespaces are generated: scripts/i18n-namespaces.mjs --write.
 */
export async function I18nArea({ area, children }: { area: string; children: React.ReactNode }) {
  const locale = await getLocale()
  let dict: Dict | null = null
  if (locale === 'en') {
    dict = await import(`./dict/en-areas/${area}`).then((m: { default: Dict }) => m.default).catch(() => null)
  }
  return <I18nExtend dict={dict}>{children}</I18nExtend>
}
