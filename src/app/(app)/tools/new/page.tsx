import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, ChevronRight, ListChecks, ShieldCheck } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listApiTokens } from '@/lib/data/tokens'
import { submitPrompt } from '@/lib/tool-review'
import { CodeBlock } from '@/components/connect/code-block'

export const metadata = { title: '툴 등록 요청 · AI쓰발' }

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
        <p className="text-[12.5px] font-semibold" style={{ color: '#5b3fc4' }}>
          툴 등록 요청
        </p>
        <h1 className="text-[20px] font-bold leading-snug" style={{ color: '#111' }}>
          내 AI에게 등록을 부탁하세요
        </h1>
        <p className="text-[13.5px] text-[#555]">
          툴은 멤버의 AI가 직접 조사해서 등록 요청하고, 운영진의 AI 검토를 거쳐 올라가요. 사람이 폼을 채우는 대신 AI가 중복을 확인하고 공식 페이지를 읽은 뒤 정확하게 적어요.
        </p>
      </section>

      <section className="card p-4 sm:p-5">
        <ol className="guide-steps">
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: '#111' }}>
              AI 연결하기 <span className="text-[12px] font-normal text-[#888]">· ‘툴 등록 요청’ 권한</span>
            </h2>
            {canSubmit ? (
              <p className="text-[13px] text-[#1f7a4d] mt-1 inline-flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> 이미 툴 등록 권한이 있는 AI가 연결돼 있어요.
              </p>
            ) : (
              <p className="text-[13px] text-[#555] mt-1">Claude, ChatGPT, Cursor 등 쓰는 AI를 AI쓰발 MCP에 연결해요. 1분이면 끝나요.</p>
            )}
            <Link href="/connect?preset=tools" className={`btn ${canSubmit ? 'btn-secondary' : 'btn-primary'} btn-sm rounded-full min-h-[40px] mt-2 inline-flex items-center gap-1.5`}>
              <Bot className="w-4 h-4" /> {canSubmit ? '다른 AI 연결하기' : '내 AI 연결하기'} <ChevronRight className="w-4 h-4" />
            </Link>
          </li>
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: '#111' }}>
              이 메시지를 AI에게 보내기
            </h2>
            <p className="text-[13px] text-[#555] mt-1 mb-2">마지막 줄의 툴 이름이나 URL만 바꿔서 보내세요.</p>
            <CodeBlock code={submitPrompt(tool || undefined)} label="등록 요청 메시지" wrap />
          </li>
          <li>
            <h2 className="text-[15px] font-semibold" style={{ color: '#111' }}>
              검토 상태 확인하기
            </h2>
            <p className="text-[13px] text-[#555] mt-1">운영진 AI가 실제 페이지와 중복 여부를 확인한 뒤 승인하거나, 이유와 함께 반려해요.</p>
            <Link href="/tools/submissions" className="btn btn-secondary btn-sm rounded-full min-h-[40px] mt-2 inline-flex items-center gap-1.5">
              <ListChecks className="w-4 h-4" /> 내 등록 요청 보기
            </Link>
          </li>
        </ol>
      </section>
    </div>
  )
}
