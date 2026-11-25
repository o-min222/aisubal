import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUserState } from '@/lib/auth'
import { getT } from '@/i18n/server'
import { safeNextPath } from '@/lib/handoff-rules'
import { SignedOutLanding } from '@/components/landing/signed-out-landing'
import { OG_DEFAULT } from '@/lib/og'
import { SITE_ORIGIN } from '@/lib/invite-share'
import {
  SHARE_PATH_HEADER,
  postOgPath,
  shareCanonicalUrl,
  shareMeta,
  sharePreviewKind,
  sharedPostId,
  teaserMeta,
  TEASER_HOOK,
} from '@/lib/share-teaser'
import { getShareTeaser } from '@/lib/data/share-teaser'

type Props = { searchParams: Promise<{ preview?: string; next?: string; error?: string }> }

/**
 * A25 / A100: a shared link opened signed out (and KakaoTalk / Slack / Applebot scrapers, which
 * have no session) lands here with ?next=/posts/…. Members-only content stays behind the teaser
 * rules: an eligible 전체-회원 real-name post (0132) gets a ~100-char preview titled 'AI쓰발'
 * (no author name) and a generated card; everything else gets a generic site card with no content leak.
 * Link-preview bots get this page at the original URL itself (middleware rewrite, no redirect).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const next = (await searchParams).next ?? (await headers()).get(SHARE_PATH_HEADER) ?? undefined
  const kind = sharePreviewKind(next)
  if (!kind) return {}
  const t = await getT()
  let title =
    kind === 'anon' ? t('AI쓰발 익명 라운지에 공유된 글')
    : kind === 'agora' ? t('AI쓰발 아고라에 공유된 글')
    : kind === 'profile' ? t('AI쓰발 멤버')
    : kind === 'gallery' ? t('AI쓰발 갤러리')
    : t('AI쓰발에 공유된 글')
  let description =
    kind === 'profile' ? t('AI쓰발 멤버만 볼 수 있어요. 로그인하면 이 프로필로 이동해요.')
    : kind === 'gallery' ? t('AI쓰발 멤버만 볼 수 있어요. 로그인하면 이 항목으로 이동해요.')
    : t('AI쓰발 멤버만 볼 수 있어요. 로그인하면 바로 이 글로 이동해요.')
  const id = kind === 'post' ? sharedPostId(next) : null
  const teaser = id ? await getShareTeaser(id) : null
  let image = OG_DEFAULT
  if (teaser && id) {
    const m = teaserMeta(teaser, t(TEASER_HOOK))
    title = m.title
    description = m.description
    image = { url: `${SITE_ORIGIN}${postOgPath(id)}`, width: 1200, height: 630, alt: title }
  }
  return {
    description,
    ...shareMeta({ title, description, url: shareCanonicalUrl(next), image }),
  }
}

/** A65c: the one landing + sign-in screen (/login and signed-out protected pages redirect here). */
export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  const state = await getUserState()
  // dev only: DEV_BYPASS_AUTH signs everyone in, so ?preview=1 shows the signed-out landing
  const devPreview = process.env.NODE_ENV !== 'production' && sp.preview === '1'
  if (state.type === 'member' && !devPreview) redirect(safeNextPath(sp.next) ?? '/feed')
  if (state.type === 'waitlist') redirect('/waitlist')
  return <SignedOutLanding error={Boolean(sp.error)} />
}
