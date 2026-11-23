import { ImageResponse } from 'next/og'
import { getInvitePreview } from '@/lib/data/invites'
import { DICTS } from '@/i18n/dict'
import type { Locale } from '@/i18n/config'
import { makeT, msg } from '@/i18n/translate'
import { INVITE_MOTTO } from '@/lib/invite-share'

export const INVITE_OG_SIZE = { width: 1200, height: 630 }

/** Fetch only the glyphs we draw from Google Fonts (tiny subset). No browser UA on
 * purpose: Google then serves TrueType, which the OG renderer reads (not WOFF2). */
export async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`)
    ).text()
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
    if (!url) return null
    const res = await fetch(url)
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

/**
 * Link preview card (messengers, SMS apps, X, Slack…) for /i/{code} in the given language.
 * Crawlers send no cookies, so the locale comes from the URL (?lang=), which the
 * share link carries when the inviter uses a non-default language.
 */
export async function renderInviteOg(code: string, locale: Locale): Promise<ImageResponse> {
  const t = makeT(locale, DICTS[locale])
  const preview = await getInvitePreview(code)
  const who = preview.status === 'valid' && preview.inviter ? preview.inviter.displayName.slice(0, 16) : null
  const headline = who ? t(msg('{who}님이 당신을 지목했습니다'), { who }) : t(msg('AI쓰발 초대장'))
  const sub = t(msg('초대받은 사람만 들어올 수 있는 AI 결사'))
  const brand = 'AI쓰발'
  const footer = `aisubal.vercel.app/i/${code.toUpperCase().slice(0, 8)}`
  // the subset must include every glyph drawn with this font (Latin too)
  const font = await loadFont(headline + sub + brand + footer + INVITE_MOTTO + 'AI')
  const ok = Boolean(font)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#111', color: '#fff', padding: '72px 80px', fontFamily: ok ? 'NotoKR' : 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#fff', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800 }}>AI</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{ok ? brand : 'AISUBAL'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: locale === 'ko' ? 76 : 70, fontWeight: 800, lineHeight: 1.15, letterSpacing: locale === 'ko' ? -1.5 : -1 }}>{ok ? headline : "You've been chosen"}</div>
          <div style={{ fontSize: 34, color: '#bdbdbd' }}>{ok ? sub : 'An AI society, by invitation only'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: '#8f8f8f' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 14, height: 14, borderRadius: 99, background: preview.status === 'valid' ? '#3ccf7c' : '#f5a623' }} />
            {footer}
          </div>
          <div style={{ fontSize: 26, color: '#6f6f6f' }}>{INVITE_MOTTO}</div>
        </div>
      </div>
    ),
    { ...INVITE_OG_SIZE, fonts: font ? [{ name: 'NotoKR', data: font, weight: 800, style: 'normal' }] : undefined },
  )
}
