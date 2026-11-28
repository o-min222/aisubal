import { ImageResponse } from 'next/og'
import { loadFont } from '@/lib/invite-og'
import { INVITE_MOTTO } from '@/lib/invite-share'
import { SHARE_OG_TITLE, type ShareTeaser } from '@/lib/share-teaser'

const POST_OG_SIZE = { width: 1200, height: 630 }

/**
 * Generated share card for an eligible 전체-회원 real-name post. Never uses the post's own image,
 * and never draws an author name, nickname, handle or avatar — only 'AI쓰발' and the teaser.
 */
export async function renderPostShareOg(teaser: ShareTeaser): Promise<ImageResponse> {
  const line = teaser.body ?? teaser.title ?? ''
  const brand = SHARE_OG_TITLE
  const font = await loadFont(line + brand + INVITE_MOTTO + 'AI')
  const ok = Boolean(font)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#111',
          color: '#fff',
          padding: '72px 80px',
          fontFamily: ok ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#fff',
              color: '#111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            AI
          </div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{brand}</div>
        </div>
        <div
          style={{
            fontSize: line.length > 60 ? 44 : 52,
            fontWeight: 800,
            lineHeight: 1.25,
            letterSpacing: -1,
            maxWidth: 1040,
          }}
        >
          {line}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: '#8f8f8f' }}>
          <div>aisubal.vercel.app</div>
          <div style={{ fontSize: 26, color: '#6f6f6f' }}>{INVITE_MOTTO}</div>
        </div>
      </div>
    ),
    { ...POST_OG_SIZE, fonts: font ? [{ name: 'NotoKR', data: font, weight: 800, style: 'normal' }] : undefined },
  )
}
