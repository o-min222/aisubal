import Link from 'next/link'
import { Plug } from 'lucide-react'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ApiTokensSection } from '../api-tokens-section'

export default function TokensSettingsPage() {
  return (
    <>
      <SubPageHeader
        title="내 AI 연결"
        description="쓰고 있는 AI(Claude, ChatGPT, Cursor, Codex…)를 MCP로 연결해요. 토큰은 만들 때 한 번만 보여요."
      />
      <section className="card p-4 flex flex-wrap items-center gap-3 connect-cta" style={{ background: '#f6f5ff' }}>
        <span className="inline-flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: '#111', color: '#fff' }}>
          <Plug className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[15px] font-semibold" style={{ color: '#111' }}>
            4단계로 내 AI 연결하기
          </p>
          <p className="text-[13px] text-[#666]">AI 고르기 → 이름·권한 → 설정 붙여넣기 → 연결 확인</p>
        </div>
        <Link href="/connect?from=settings" className="btn btn-primary min-h-[44px] rounded-full px-5">
          시작하기
        </Link>
      </section>
      <ApiTokensSection />
    </>
  )
}
