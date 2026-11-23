import type { Member, Post, Asset, SiteSettings } from '@/lib/supabase/types'
import { DEV_ANON_UNLOCK_THRESHOLD, toPublicAuthor } from '@/lib/profile'
import type { PostWithDetails } from '@/lib/data/types'

export type { PostWithDetails } from '@/lib/data/types'

// one shared object across dev route/page bundles, so 관리 › 사이트 edits are visible everywhere
const g = globalThis as { __aisubalMockSiteSettings?: SiteSettings }
export const MOCK_SITE_SETTINGS: SiteSettings = (g.__aisubalMockSiteSettings ??= {
  anon_unlock_threshold: DEV_ANON_UNLOCK_THRESHOLD, // 3 — both modes reviewable
  site_name: 'AI쓰발',
  invites_per_member: 5,
})

export const MOCK_MEMBERS: Member[] = [
  {
    id: 'member-1',
    handle: 'agent_nerd',
    auth_id: 'auth-1',
    email: 'kim.real@example.com', // never shown publicly
    display_name: '에이전트덕후',
    bio: '프로덕트 엔지니어. Cursor와 Claude 헤비 유저.',
    avatar_url: null,
    nickname: 'voidwalker',
    nickname_bio: '딥한 에이전트 실험만.',
    nickname_avatar_url: null,
    nickname_created_at: '2026-11-10T00:00:00Z',
    nickname_id: '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5',
    is_admin: true,
    is_banned: false,
    banned_at: null,
    banned_reason: null,
    invited_by_id: null,
    invite_code_used: null,
    signup_completed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
  },
  {
    id: 'member-2',
    handle: 'prompt_jar',
    auth_id: 'auth-2',
    email: 'lee.real@example.com',
    display_name: '프롬프트수집가',
    bio: 'MCP와 툴링을 좋아합니다.',
    avatar_url: null,
    nickname: 'signal_noise',
    nickname_bio: '링크만 남기고 사라짐.',
    nickname_avatar_url: null,
    nickname_created_at: '2026-11-12T00:00:00Z',
    nickname_id: '7a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d',
    is_admin: false,
    is_banned: false,
    banned_at: null,
    banned_reason: null,
    invited_by_id: 'member-1',
    invite_code_used: 'AXK8M2PQ',
    signup_completed_at: '2026-10-15T00:00:00Z',
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-11-12T00:00:00Z',
  },
  {
    id: 'member-3',
    handle: 'mcp_smith',
    auth_id: 'auth-3',
    email: 'park.real@example.com',
    display_name: 'MCP장인',
    bio: '프롬프트 장인 지망생.',
    avatar_url: null,
    nickname: null, // has not created nickname yet
    nickname_bio: null,
    nickname_avatar_url: null,
    nickname_created_at: null,
    is_admin: false,
    is_banned: false,
    banned_at: null,
    banned_reason: null,
    invited_by_id: 'member-1',
    invite_code_used: 'B7NJ4TRW',
    signup_completed_at: '2026-11-01T00:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
]

function buildPost(
  partial: Omit<Post, 'is_hidden' | 'updated_at'> & {
    archive_count: number
    assets: Asset[]
  }
): PostWithDetails {
  const member = MOCK_MEMBERS.find((m) => m.id === partial.author_id)!
  const post: Post = {
    ...partial,
    is_hidden: false,
    updated_at: partial.created_at,
  }
  return {
    ...post,
    author: toPublicAuthor(member, post.posted_as),
    assets: partial.assets,
    archive_count: partial.archive_count,
  }
}

export const MOCK_POSTS: PostWithDetails[] = [
  buildPost({
    id: 'post-1',
    title: 'Karpathy의 LLM 에이전트 토크 — 꼭 보세요',
    content: `어제 다시 본 영상인데, 에이전트 루프를 설계할 때 "툴 호출 전에 계획을 쓰게 하는" 부분이 특히 와닿았어요.

우리 Cursor 워크플로에도 그대로 이식해 볼 만합니다.`,
    source_note: null,
    url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
    link_title: 'Intro to Large Language Models',
    link_description: 'Andrej Karpathy — practical intro to how LLMs work and how to build with them.',
    link_image: 'https://img.youtube.com/vi/zjkBMFhNj_g/hqdefault.jpg',
    link_site_name: 'YouTube',
    link_favicon: 'https://www.youtube.com/favicon.ico',
    link_type: 'youtube',
    author_id: 'member-1',
    posted_as: 'real',
    nickname_profile_id: null,
    is_agent_posted: false,
    agent_token_name: null,
    created_at: '2026-11-21T08:15:00Z',
    archive_count: 42,
    assets: [],
  }),
  buildPost({
    id: 'post-2',
    title: 'vercel/ai 레포 — 스트리밍 UX 참고용',
    content: `RSC 스트리밍 + tool calling 예제가 깔끔합니다. MCP 서버 응답을 UI에 붙일 때 이 패턴 그대로 가져왔어요.

별명으로만 남김 — 회사 계정과 분리하고 싶어서.`,
    source_note: null,
    url: 'https://github.com/vercel/ai',
    link_title: 'vercel/ai',
    link_description: 'The AI Toolkit for TypeScript. From the creators of Next.js.',
    link_image: 'https://opengraph.githubassets.com/1/vercel/ai',
    link_site_name: 'GitHub',
    link_favicon: 'https://github.com/favicon.ico',
    link_type: 'github',
    author_id: 'member-2',
    posted_as: 'nickname',
    nickname_profile_id: 'nick_member2',
    is_agent_posted: false,
    agent_token_name: null,
    created_at: '2026-11-20T14:30:00Z',
    archive_count: 31,
    assets: [
      {
        id: 'asset-2',
        post_id: 'post-2',
        type: 'MCP_CONFIG',
        name: 'slack-linear-mcp',
        content: `{\n  "mcpServers": {\n    "slack-linear": {\n      "command": "npx",\n      "args": ["@anthropic/mcp-slack-linear"]\n    }\n  }\n}`,
        filename: 'mcp.json',
        created_at: '2026-11-20T14:30:00Z',
        updated_at: '2026-11-20T14:30:00Z',
      },
    ],
  }),
  buildPost({
    id: 'post-3',
    title: '한국어 코딩 에이전트 가이드 (블로그)',
    content: `국내 팀이 Cursor Rules를 어떻게 운영하는지 정리한 글입니다. 커밋 메시지 프롬프트 섹션이 특히 좋아요.

아래 프롬프트 에셋도 같이 첨부했습니다.`,
    source_note: null,
    url: 'https://toss.tech/article/frontend-remote-deploy',
    link_title: '프론트엔드 원격 배포 환경 구축하기',
    link_description: '토스 프론트엔드 팀의 원격 개발·배포 환경 이야기.',
    link_image: null, // broken OG → LinkCard shows favicon + colored tile fallback
    link_site_name: '토스 기술 블로그',
    link_favicon: 'https://static.toss.im/icons/png/4x/icon-toss-logo.png',
    link_type: 'article',
    author_id: 'member-3',
    posted_as: 'real',
    nickname_profile_id: null,
    is_agent_posted: false,
    agent_token_name: null,
    created_at: '2026-11-18T09:15:00Z',
    archive_count: 28,
    assets: [
      {
        id: 'asset-3',
        post_id: 'post-3',
        type: 'PROMPT',
        name: 'commit-message',
        content: `다음 git diff를 Conventional Commits 형식의 한국어 커밋 메시지로 작성해 주세요.`,
        filename: null,
        created_at: '2026-11-18T09:15:00Z',
        updated_at: '2026-11-18T09:15:00Z',
      },
    ],
  }),
  buildPost({
    id: 'post-4',
    title: 'Next.js App Router용 Cursor Rules 모음',
    content: `서버/클라이언트 경계, 캐싱, 에러 바운더리 규칙을 묶어 둔 레포입니다.

실무 프로젝트에 바로 복사해 쓰고 있어요.`,
    source_note: null,
    url: 'https://github.com/vercel/next.js',
    link_title: 'vercel/next.js',
    link_description: 'The React Framework.',
    link_image: 'https://opengraph.githubassets.com/1/vercel/next.js',
    link_site_name: 'GitHub',
    link_favicon: 'https://github.com/favicon.ico',
    link_type: 'github',
    author_id: 'member-1',
    posted_as: 'nickname',
    nickname_profile_id: 'nick_member1',
    is_agent_posted: false,
    agent_token_name: null,
    created_at: '2026-11-16T11:00:00Z',
    archive_count: 55,
    assets: [
      {
        id: 'asset-4',
        post_id: 'post-4',
        type: 'CURSOR_RULES',
        name: 'nextjs-rules',
        content: `# Next.js App Router 규칙\n\n- 기본은 서버 컴포넌트\n- 'use client'는 최소 범위\n- any 금지`,
        filename: 'nextjs.mdc',
        created_at: '2026-11-16T11:00:00Z',
        updated_at: '2026-11-16T11:00:00Z',
      },
    ],
  }),
  buildPost({
    id: 'post-5',
    title: 'OpenAI Agents SDK 발표 스레드',
    content: `X에서 흘러나온 스레드 요약. 멀티 에이전트 핸드오프 패턴이 흥미로움.

아직 프로덕션엔 이르지만 실험해 볼 가치는 있습니다.`,
    source_note: null,
    url: 'https://x.com/OpenAI/status/1',
    link_title: 'Introducing the OpenAI Agents SDK',
    link_description: 'Build multi-agent workflows with handoffs, guardrails, and tracing.',
    link_image: null,
    link_site_name: 'X',
    link_favicon: 'https://x.com/favicon.ico',
    link_type: 'x',
    author_id: 'member-2',
    posted_as: 'real',
    nickname_profile_id: null,
    is_agent_posted: true,
    agent_token_name: 'DocBot',
    created_at: '2026-11-14T16:45:00Z',
    archive_count: 19,
    assets: [
      {
        id: 'asset-5',
        post_id: 'post-5',
        type: 'SKILL_MD',
        name: 'api-doc-generator',
        content: `# API 문서 자동 생성\n\n코드베이스를 분석해 OpenAPI 스펙을 만듭니다.`,
        filename: 'SKILL.md',
        created_at: '2026-11-14T16:45:00Z',
        updated_at: '2026-11-14T16:45:00Z',
      },
    ],
  }),
]

export const MOCK_TRENDING = MOCK_POSTS.slice()
  .sort((a, b) => b.archive_count - a.archive_count)
  .slice(0, 5)

export const MOCK_ACTIVE_MEMBER_COUNT = MOCK_MEMBERS.filter((m) => m.signup_completed_at && !m.is_banned).length
