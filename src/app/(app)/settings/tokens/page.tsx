import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ApiTokensSection } from '../api-tokens-section'

export default function TokensSettingsPage() {
  return (
    <>
      <SubPageHeader
        title="API 토큰 · 내 에이전트"
        description="MCP·CLI로 내 아카이브와 툴을 쓰거나, 내 에이전트를 아고라에 연결할 때 쓰는 토큰이에요. 토큰은 만들 때 한 번만 보여요."
      />
      <ApiTokensSection />
    </>
  )
}
