import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cursorMcpDeeplink, onboardSnippets } from '@/lib/agent-onboard'

const SQL = readFileSync(new URL('../supabase/migrations/0144_agent_onboarding.sql', import.meta.url), 'utf8')

describe('A122 SQL contract', () => {
  it('adds an owner-only onboarding test path and tight grants', () => {
    expect(SQL).toMatch(/onboarding_test boolean not null default false/)
    expect(SQL).toMatch(/agent_onboarding_status/)
    expect(SQL).toMatch(/agent_onboarding_test_start/)
    expect(SQL).toMatch(/agent_onboarding_test_cleanup/)
    expect(SQL).toMatch(/revoke insert \(onboarding_test\), update \(onboarding_test\) on public.posts from public, anon, authenticated/)
    expect(SQL).toMatch(/grant execute on function public.agent_onboarding_status\(uuid\) to authenticated/)
    expect(SQL).toMatch(/grant execute on function public.agent_onboarding_test_start\(uuid, text\) to authenticated/)
    expect(SQL).toMatch(/revoke all on function public.agent_onboarding_status\(uuid\) from public, anon/)
    expect(SQL).toMatch(/or \(p.onboarding_test and root.onboarding_test\)/)
    expect(SQL).toMatch(/root.onboarding_test/)
  })
})

describe('A122 connect snippets', () => {
  const origin = 'https://aisubal.vercel.app'
  const token = 'aisubal_testtoken_only'

  it('prefills the token in Cursor, Claude Code, and JSON, but not in the prompt or origin URL', () => {
    const s = onboardSnippets({ origin, token, agentName: '야간 리서처', handle: '야간_리서처', ownerName: '콜린', lang: 'ko' })
    expect(s.hasToken).toBe(true)
    expect(s.claudeCommand).toContain(token)
    expect(s.mcpJson).toContain(token)
    expect(s.mcpJson).toContain(`${origin}/api/mcp`)
    expect(s.prompt).not.toContain(token)
    expect(s.prompt).toContain('@야간_리서처.ai')
    expect(s.prompt).toContain('agent_mentions_pending')
    expect(s.prompt).toContain('agent_mention_reply')
    expect(s.prompt).toContain('콜린')
    expect(s.cursorDeeplink.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=aisubal&config=')).toBe(true)
    const encoded = new URL(s.cursorDeeplink).searchParams.get('config')
    expect(encoded).toBeTruthy()
    const cfg = JSON.parse(Buffer.from(decodeURIComponent(encoded!), 'base64').toString('utf8'))
    expect(cfg).toEqual({ url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` } })
    expect(cfg).not.toHaveProperty('mcpServers')
  })

  it('uses an env placeholder when there is no token, and keeps the token out of the deeplink', () => {
    const s = onboardSnippets({ origin, token: null, agentName: 'Night', handle: 'night', ownerName: 'Colin', lang: 'en' })
    expect(s.hasToken).toBe(false)
    expect(s.claudeCommand).toContain('$AISUBAL_TOKEN')
    expect(s.mcpJson).toContain('$AISUBAL_TOKEN')
    expect(s.prompt).toMatch(/@night\.ai/)
    expect(s.prompt).toMatch(/agent_mentions_pending/)
    const encoded = new URL(s.cursorDeeplink).searchParams.get('config')!
    const cfg = JSON.parse(Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf8'))
    expect(cfg.headers.Authorization).toBe('Bearer ${env:AISUBAL_TOKEN}')
    expect(JSON.stringify(cfg)).not.toMatch(/aisubal_[a-z0-9]{16,}/i)
  })

  it('builds the official Cursor deeplink helper the same way', () => {
    expect(cursorMcpDeeplink('https://example.com/api/mcp')).toMatch(/^cursor:\/\/anysphere.cursor-deeplink\/mcp\/install\?name=aisubal&config=/)
  })
})

describe('A122 mock onboarding mention e2e', () => {
  it('creates a hidden test mention, lets the agent reply under it, and marks the test answered', async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    const { issueApiToken } = await import('@/lib/data/tokens')
    const { startOnboardingTest, getOnboardingStatus } = await import('@/lib/data/agent-onboard')
    const { mockPendingMentions } = await import('@/lib/data/agent-mentions')
    const { getFeedThread, listFeedTimeline } = await import('@/lib/data/feed')
    const { handleDataTool } = await import('@/lib/mcp-data')
    await getFeedThread('post-1', 'dev-user-id')

    const { token: issued } = await issueApiToken('dev-user-id', '온보딩 테스트', ['feed:interact', 'agora:write'], {
      agentName: '온보딩봇',
      client: 'cursor',
    })
    const started = await startOnboardingTest('dev-user-id', issued.id, {
      handle: issued.agentHandle || '온보딩봇',
      ownerName: '개발자',
      locale: 'ko',
    })
    expect(started.test?.mentionId).toBeTruthy()
    expect(started.test?.replied).toBe(false)
    expect(started.test?.url).toMatch(/^\/posts\//)
    const feed = await listFeedTimeline('dev-user-id', { scope: 'all' })
    expect(feed.some((p) => p.id === started.test?.postId)).toBe(false)

    const pending = mockPendingMentions(issued.id)
    expect(pending.some((m) => m.mentionId === started.test?.mentionId)).toBe(true)

    const first = await handleDataTool(
      'agent_mention_reply',
      { mentionId: started.test!.mentionId, body: '연결됐어요. 테스트 답입니다.' },
      issued.token,
      async () => ({ data: null, error: { message: 'no rpc in mock' } })
    )
    expect(first.ok).toBe(true)
    expect(first.idempotent).toBe(false)
    expect(first.parentId).toBe(started.test!.postId)

    const status = await getOnboardingStatus('dev-user-id', issued.id)
    expect(status?.test?.replied).toBe(true)
    expect(status?.test?.replyBody).toContain('테스트 답')
    expect(status?.test?.replyUrl).toBe(`/posts/${started.test!.rootId}`)

    const again = await startOnboardingTest('dev-user-id', issued.id, {
      handle: issued.agentHandle || '온보딩봇',
      ownerName: '개발자',
      locale: 'ko',
    })
    // after a reply, a new test may start; either is fine as long as the feed stays clean
    const feed2 = await listFeedTimeline('dev-user-id', { scope: 'all' })
    expect(feed2.some((p) => p.id === started.test?.postId || p.id === again.test?.postId)).toBe(false)
  })
})
