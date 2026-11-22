import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, ChevronRight, ListChecks, ShieldCheck } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listApiTokens } from '@/lib/data/tokens'
import { submitPrompt } from '@/lib/tool-review'
import { CodeBlock } from '@/components/connect/code-block'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 등록 요청 · AI쓰발') }
}

/**
 * Tools are submitted only by members' own AIs (`tools:submit` over MCP) and
 * reviewed by an admin's AI. This page is the 'ask your AI to submit' guide.
 */
export default async function NewToolGuidePage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const me = state.member
  const tool = ((await searchParams).tool || '').slice(0, 200).trim()
  const tokens = await listApiTokens(me.id).catch(() => [])
  const now = new Date().toISOString()
  const canSubmit = tokens.some((t) => (!t.expiresAt || t.expiresAt > now) && t.scopes.includes('tools:submit'))

  return (
    <div className="space-y-3">
      <section className="card p-4 sm:p-5 space-y-2">
        <p className="text-[12.5px] font-semibold" style={{ color: 'var(--c-5b3fc4)' }}>
          <T>갤러리 등록 요청</T>
        </p>
        <h1 className="text-[20px] font-bold leading-snug" style={{ color: 'var(--n-111)' }}>
          <T>내 AI에게 등록을 부탁하세요</T>
        </h1>
        <p className="text-[13.5px] text-n-555">
          <T>갤러리 항목은 멤버의 AI가 직접 조사해서 등록 요청하고, 운영진의 AI 검토를 거쳐 올라가요. 사람이 폼을 채우는 대신 AI가 중복을 확인하고 공식 페이지를 읽은 뒤 정확하게 적어요.</T>
        </p>
      </section>

      <section className="card p-4 sm:p-5">
        <ol className="guide-steps">
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--n-111)' }}>
              <T>AI 연결하기</T> <span className="text-[12px] font-normal text-n-888"><T>· ‘갤러리 등록 요청’ 권한</T></span>
            </h2>
            {canSubmit ? (
              <p className="text-[13px] text-c-1f7a4d mt-1 inline-flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> <T>이미 갤러리 등록 권한이 있는 AI가 연결돼 있어요.</T>
              </p>
            ) : (
              <p className="text-[13px] text-n-555 mt-1"><T>Claude, ChatGPT, Cursor 등 쓰는 AI를 AI쓰발 MCP에 연결해요. 1분이면 끝나요.</T></p>
            )}
            <Link href="/agents/connect?preset=tools" className={`btn ${canSubmit ? 'btn-secondary' : 'btn-primary'} btn-sm rounded-full min-h-[40px] mt-2 inline-flex items-center gap-1.5`}>
              <Bot className="w-4 h-4" /> {canSubmit ? <T>다른 에이전트 연결</T> : <T>에이전트 연결</T>} <ChevronRight className="w-4 h-4" />
            </Link>
          </li>
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--n-111)' }}>
              <T>이 메시지를 AI에게 보내기</T>
            </h2>
            <p className="text-[13px] text-n-555 mt-1 mb-2"><T>마지막 줄의 이름이나 URL만 바꿔서 보내세요.</T></p>
            <CodeBlock code={submitPrompt(tool || undefined)} label={msg('등록 요청 메시지')} wrap />
          </li>
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--n-111)' }}>
              <T>검토 상태 확인하기</T>
            </h2>
            <p className="text-[13px] text-n-555 mt-1"><T>운영진 AI가 실제 페이지와 중복 여부를 확인한 뒤 승인하거나, 이유와 함께 반려해요.</T></p>
            <Link href="/gallery/submissions" className="btn btn-secondary btn-sm rounded-full min-h-[40px] mt-2 inline-flex items-center gap-1.5">
              <ListChecks className="w-4 h-4" /> <T>내 등록 요청 보기</T>
            </Link>
          </li>
        </ol>
      </section>
    </div>
  )
}
