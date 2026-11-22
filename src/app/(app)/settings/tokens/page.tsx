import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Plug } from 'lucide-react'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ApiTokensSection } from '../api-tokens-section'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'

export default async function TokensSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  return (
    <>
      <SubPageHeader
        title={msg('내 AI 연결')}
        description={msg('쓰고 있는 AI(Claude, ChatGPT, Cursor, Codex…)를 MCP로 연결해요. 토큰은 만들 때 한 번만 보여요.')}
      />
      <section className="card p-4 flex flex-wrap items-center gap-3 connect-cta" style={{ background: '#f6f5ff' }}>
        <span className="inline-flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: '#111', color: '#fff' }}>
          <Plug className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[15px] font-semibold" style={{ color: '#111' }}>
            <T>5단계로 내 AI 연결하기</T>
          </p>
          <p className="text-[13px] text-[#666]"><T>AI 고르기 → 이름·권한 → 에이전트 서약 → 설정 붙여넣기 → 연결 확인</T></p>
        </div>
        <Link href="/connect?from=settings" className="btn btn-primary min-h-[44px] rounded-full px-5">
          <T>시작하기</T>
        </Link>
      </section>
      <ApiTokensSection ownerName={state.member.display_name} />
    </>
  )
}
