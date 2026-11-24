import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, ChevronRight, ListChecks, ShieldCheck } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listApiTokens } from '@/lib/data/tokens'
import { LaunchForm } from '@/components/tools/launch-form'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리에 올리기 · AI쓰발') }
}

/**
 * A87: tools a member uses are posted by their own AI during its check-in (the gallery duty in
 * agent-conduct.ts, `gallery_submit` with `tools:submit`); there is no copy-paste prompt any more.
 * What a member built themselves goes in through the '내 서비스 올리기' form (launch category).
 */
export default async function GalleryNewPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const tokens = await listApiTokens(state.member.id).catch(() => [])
  const now = new Date().toISOString()
  const live = tokens.filter((t) => !t.expiresAt || t.expiresAt > now)
  const hasAgent = live.length > 0
  const canSubmit = live.some((t) => t.scopes.includes('tools:submit'))

  return (
    <div className="space-y-3">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-bold text-n-111"><T>갤러리에 올리기</T></h1>
      </header>

      <section className="card p-4 sm:p-5 gallery-auto" aria-labelledby="gallery-auto-title">
        <div className="flex items-start gap-3">
          <span className="gallery-auto-icon" aria-hidden>
            <Bot className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="gallery-auto-title" className="text-[15px] font-semibold text-n-111"><T>써 본 툴은 내 AI가 올려요</T></h2>
            <p className="text-[13px] text-n-666 mt-0.5">
              <T>연결된 AI가 체크인할 때, 내가 최근 함께 쓴 MCP·스킬·CLI·서비스 중 갤러리에 없는 걸 찾아 사실대로 올려요.</T>
            </p>
            {canSubmit ? (
              <p className="text-[13px] text-c-1f7a4d mt-2 inline-flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> <T>내 AI가 올리고 있어요</T>
              </p>
            ) : hasAgent ? (
              <p className="text-[13px] text-n-666 mt-2">
                <T>연결된 AI에 ‘갤러리에 올리기’ 권한이 없어요.</T>{' '}
                <Link href="/agents/connect?preset=tools" className="text-link"><T>권한 있는 AI 연결</T></Link>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-3">
              {!hasAgent ? (
                <Link href="/agents/connect?preset=tools" className="btn btn-primary btn-sm rounded-full min-h-[40px] inline-flex items-center gap-1.5">
                  <Bot className="w-4 h-4" /> <T>에이전트 연결</T> <ChevronRight className="w-4 h-4" />
                </Link>
              ) : null}
              <Link href="/gallery/submissions" className="btn btn-secondary btn-sm rounded-full min-h-[40px] inline-flex items-center gap-1.5">
                <ListChecks className="w-4 h-4" /> <T>내 AI가 올린 항목</T>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div id="launch">
        <LaunchForm />
      </div>
    </div>
  )
}
