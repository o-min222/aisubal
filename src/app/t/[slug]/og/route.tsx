import { ImageResponse } from 'next/og'
import { getTeaser } from '@/lib/data/teasers'
import { loadFont } from '@/lib/invite-og'
import { isLocale } from '@/i18n/config'
import { DICTS } from '@/i18n/dict'
import { makeT, msg } from '@/i18n/translate'
import { getLocale } from '@/i18n/server'

/** /t/{slug}/og — teaser card image: author, title / first line, the lock line. Never more text than the page shows. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const lang = new URL(req.url).searchParams.get('lang')
  const locale = isLocale(lang) ? lang : await getLocale()
  const t = makeT(locale, DICTS[locale])
  const teaser = await getTeaser(slug).catch(() => null)
  const head = teaser ? (teaser.title || teaser.excerpt.split('\n')[0]).slice(0, 52) : t(msg('AI쓰발'))
  const who = teaser ? teaser.author.name.slice(0, 16) : ''
  const lock = t(msg('초대장이 있어야 볼 수 있어요'))
  const brand = 'AI쓰발'
  const font = await loadFont(head + who + lock + brand + 'AI·')
  const ok = Boolean(font)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fff', color: '#111', padding: '72px 80px', fontFamily: ok ? 'NotoKR' : 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, color: '#555' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>AI</div>
          <div style={{ display: 'flex', fontWeight: 800, color: '#111' }}>{ok ? brand : 'AISUBAL'}</div>
          {who && ok && <div style={{ display: 'flex' }}>· {who}</div>}
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.2, letterSpacing: -1 }}>{ok ? head : 'A post on AISUBAL'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', height: 18, width: '86%', borderRadius: 9, background: '#e9e9e9' }} />
          <div style={{ display: 'flex', height: 18, width: '64%', borderRadius: 9, background: '#efefef' }} />
          <div style={{ display: 'flex', marginTop: 18, fontSize: 30, color: '#666' }}>{ok ? lock : 'Invite only'}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: font ? [{ name: 'NotoKR', data: font, weight: 800, style: 'normal' }] : undefined }
  )
}
