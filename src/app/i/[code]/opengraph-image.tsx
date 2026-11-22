import { ImageResponse } from 'next/og'
import { getInvitePreview } from '@/lib/data/invites'

export const alt = 'AI쓰발 초대장'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Korean glyphs: fetch only the characters we draw from Google Fonts (tiny subset).
 * No browser UA on purpose: Google then serves TrueType, which the OG renderer reads (it can't read WOFF2). */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
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

/** KakaoTalk / X / Slack preview card for /i/{code}. Inviter name only (no avatar fetch). */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const preview = await getInvitePreview(code)
  const who = preview.status === 'valid' && preview.inviter ? preview.inviter.displayName.slice(0, 16) : null
  const headline = who ? `${who}님이 초대했어요` : 'AI쓰발 초대장'
  const sub = '프롬프트 · MCP · 에이전트 스킬을 나누는 초대 전용 AI 커뮤니티'
  const brand = 'AI쓰발'
  const footer = `aisubal.vercel.app/i/${code.toUpperCase().slice(0, 8)}`
  // subset must include every glyph drawn with this font (Latin too)
  const font = await loadFont(headline + sub + brand + footer + 'AI')
  const hasKo = Boolean(font)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#111', color: '#fff', padding: '72px 80px', fontFamily: hasKo ? 'NotoKR' : 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#fff', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800 }}>AI</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{hasKo ? brand : 'AISUBAL'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.15 }}>{hasKo ? headline : "You're invited"}</div>
          <div style={{ fontSize: 34, color: '#bdbdbd' }}>{hasKo ? sub : 'An invite-only AI community'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, color: '#8f8f8f' }}>
          <div style={{ width: 14, height: 14, borderRadius: 99, background: preview.status === 'valid' ? '#3ccf7c' : '#f5a623' }} />
          {footer}
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'NotoKR', data: font, weight: 800, style: 'normal' }] : undefined }
  )
}
