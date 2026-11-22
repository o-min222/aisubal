'use client'

import { useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { THEMES, THEME_COLOR, type Theme } from '@/lib/theme'
import { useT } from '@/i18n/client'
import { msg } from '@/i18n/translate'

const META: Record<Theme, { label: string; Icon: typeof Sun }> = {
  system: { label: msg('시스템'), Icon: Monitor },
  light: { label: msg('라이트'), Icon: Sun },
  dark: { label: msg('다크'), Icon: Moon },
}

function apply(t: Theme) {
  const d = document.documentElement
  d.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  d.classList.toggle('dark', dark)
  d.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

// the <html data-theme> attribute is the source of truth (set by the server, changed by apply)
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
function readTheme(): Theme {
  const v = document.documentElement.getAttribute('data-theme')
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** System / Light / Dark. Applies instantly (no reload), saved to the cookie and the profile. */
export function ThemeSwitch({ variant = 'row' }: { variant?: 'row' | 'block' }) {
  const t = useT()
  const cur = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme)
  function pick(v: Theme) {
    if (v === cur) return
    apply(v)
    void fetch('/api/theme', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: v }) })
  }
  const seg = (
    <div className="locale-seg theme-seg" role="radiogroup" aria-label={t('화면 모드')}>
      {THEMES.map((v) => {
        const { label, Icon } = META[v]
        return (
          <button key={v} type="button" role="radio" aria-checked={v === cur} className={v === cur ? 'on' : ''} onClick={() => pick(v)} title={t(label)}>
            <Icon className="w-3.5 h-3.5" aria-hidden />
            <span className={variant === 'row' ? 'sr-only' : ''}>{t(label)}</span>
          </button>
        )
      })}
    </div>
  )
  if (variant === 'block') return <div className="locale-block">{seg}</div>
  const CurIcon = META[cur].Icon
  return (
    <div className="account-row locale-row">
      <CurIcon className="w-[18px] h-[18px]" aria-hidden /> <span className="flex-1">{t('화면 모드')}</span>
      {seg}
    </div>
  )
}
