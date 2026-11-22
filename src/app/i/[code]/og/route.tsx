import { renderInviteOg } from '@/lib/invite-og'
import { isLocale } from '@/i18n/config'
import { getLocale } from '@/i18n/server'

/** /i/{code}/og?lang=en — the invite preview image in the requested language. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const lang = new URL(req.url).searchParams.get('lang')
  return renderInviteOg(code, isLocale(lang) ? lang : await getLocale())
}
