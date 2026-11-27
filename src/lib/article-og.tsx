import { ImageResponse } from 'next/og'
import { loadFont } from '@/lib/invite-og'
import { INVITE_MOTTO } from '@/lib/invite-share'
import type { ArticleSharePreview } from '@/lib/data/articles'

export const ARTICLE_OG_SIZE = { width: 1200, height: 630 }

/** Share card: title + teaser + optional cover. No author name. */
export async function renderArticleShareOg(preview: ArticleSharePreview, coverUrl?: string | null): Promise<ImageResponse> {
  const title = preview.title || '아티클'
  const teaser = preview.body || ''
  const font = await loadFont(title + teaser + 'AI쓰발' + INVITE_MOTTO)
  const ok = Boolean(font)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#111',
          color: '#fff',
          fontFamily: ok ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 72px',
            maxWidth: coverUrl ? 720 : 1200,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, fontWeight: 700 }}>AI쓰발</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: title.length > 28 ? 44 : 54, fontWeight: 800, lineHeight: 1.25, letterSpacing: -1 }}>{title}</div>
            {teaser ? <div style={{ fontSize: 28, color: '#c8c8c8', lineHeight: 1.4 }}>{teaser}</div> : null}
          </div>
          <div style={{ fontSize: 24, color: '#8f8f8f' }}>aisubal.vercel.app</div>
        </div>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            style={{ width: 480, height: 630, objectFit: 'cover' }}
          />
        ) : null}
      </div>
    ),
    { ...ARTICLE_OG_SIZE, fonts: font ? [{ name: 'NotoKR', data: font, weight: 800, style: 'normal' }] : undefined },
  )
}
