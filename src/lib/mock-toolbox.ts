import type {
  ToolboxCompatVote,
  ToolboxEntry,
  ToolboxMention,
  ToolboxReview,
} from '@/lib/supabase/types'
import { MOCK_POSTS } from '@/lib/mock-data'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import {
  canonicalUrl,
  compatSummary,
  extractGithubOwnerRepo,
  isToolishUrl,
  recordMention,
  recomputeRating,
  sortEntries,
  type ToolboxSort,
  upsertByCanonicalUrl,
} from '@/lib/toolbox-rules'
import { verifiedSnippets } from '@/lib/install-catalog'

export type { ToolboxEntryDetails } from '@/lib/data/types'

function entry(
  partial: Omit<
    ToolboxEntry,
    | 'install_snippets'
    | 'icon_url'
    | 'homepage_url'
    | 'created_by_id'
    | 'updated_at'
  > & {
    install_snippets?: ToolboxEntry['install_snippets']
    icon_url?: string | null
    homepage_url?: string | null
  }
): ToolboxEntry {
  const gh = partial.github_url || partial.canonical_url
  const repo = extractGithubOwnerRepo(gh)
  const source = partial.source_repo || (repo ? `${repo.owner}/${repo.repo}` : null)
  // install commands only from the verified catalog — never derived from the slug/repo (B-1)
  const verified = verifiedSnippets(partial.slug)
  return {
    ...partial,
    canonical_url: canonicalUrl(partial.canonical_url),
    icon_url: partial.icon_url ?? null,
    homepage_url: partial.homepage_url ?? null,
    source_repo: source,
    install_snippets: verified?.snippets ?? {},
    install_verified: Boolean(verified && Object.keys(verified.snippets).length),
    created_by_id: null,
    updated_at: partial.created_at,
  }
}

const SEED: ToolboxEntry[] = [
  entry({
    id: 'tool-1',
    slug: 'github-mcp-server',
    name: 'GitHub MCP Server',
    one_liner: '레포·이슈·PR을 에이전트에 연결하는 공식 GitHub MCP',
    description:
      'GitHub 공식 MCP. 원격 `https://api.githubcopilot.com/mcp/` 또는 로컬 Docker. toolset/read-only 스코핑 지원.',
    type: 'mcp_server',
    tags: ['git', 'pr', '이슈', '협업'],
    canonical_url: 'https://github.com/github/github-mcp-server',
    github_url: 'https://github.com/github/github-mcp-server',
    license: 'MIT',
    last_commit_at: '2026-11-18T00:00:00Z',
    source_repo: 'github/github-mcp-server',
    mention_count: 0,
    install_count: 128,
    avg_rating: 4.8,
    rating_count: 12,
    featured: true,
    created_at: '2026-10-01T00:00:00Z',
  }),
  entry({
    id: 'tool-2',
    slug: 'context7',
    name: 'Context7',
    one_liner: '최신 라이브러리 문서를 에이전트 컨텍스트에 주입',
    description: 'Upstash Context7 — 구식 API 제안을 줄이기 위한 문서 MCP.',
    type: 'mcp_server',
    tags: ['문서', '코딩', '라이브러리'],
    canonical_url: 'https://github.com/upstash/context7',
    github_url: 'https://github.com/upstash/context7',
    license: 'MIT',
    last_commit_at: '2026-11-19T00:00:00Z',
    source_repo: 'upstash/context7',
    mention_count: 0,
    install_count: 210,
    avg_rating: 4.9,
    rating_count: 18,
    featured: true,
    created_at: '2026-09-15T00:00:00Z',
  }),
  entry({
    id: 'tool-3',
    slug: 'playwright-mcp',
    name: 'Playwright MCP',
    one_liner: '브라우저 자동화·E2E를 MCP 도구로',
    description: 'Microsoft Playwright MCP — 페이지 탐색, 클릭, 스냅샷.',
    type: 'mcp_server',
    tags: ['브라우저', '테스트', '자동화'],
    canonical_url: 'https://github.com/microsoft/playwright-mcp',
    github_url: 'https://github.com/microsoft/playwright-mcp',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-17T00:00:00Z',
    source_repo: 'microsoft/playwright-mcp',
    mention_count: 0,
    install_count: 95,
    avg_rating: 4.6,
    rating_count: 9,
    featured: true,
    created_at: '2026-10-10T00:00:00Z',
  }),
  entry({
    id: 'tool-4',
    slug: 'chrome-devtools-mcp',
    name: 'Chrome DevTools MCP',
    one_liner: '라이브 Chrome에서 디버그·프로파일',
    description: 'ChromeDevTools 공식 MCP. slim 모드 지원.',
    type: 'mcp_server',
    tags: ['브라우저', '디버그', '성능'],
    canonical_url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    github_url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-20T00:00:00Z',
    source_repo: 'ChromeDevTools/chrome-devtools-mcp',
    mention_count: 0,
    install_count: 180,
    avg_rating: 4.7,
    rating_count: 14,
    featured: false,
    created_at: '2026-10-20T00:00:00Z',
  }),
  entry({
    id: 'tool-5',
    slug: 'supabase-mcp',
    name: 'Supabase MCP',
    one_liner: 'DB·Auth·스토리지를 에이전트에서 조작',
    description: 'Supabase 공식 MCP. read_only / project_ref 스코핑.',
    type: 'mcp_server',
    tags: ['데이터베이스', 'backend', 'postgres'],
    canonical_url: 'https://github.com/supabase/mcp',
    github_url: 'https://github.com/supabase/mcp',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-16T00:00:00Z',
    source_repo: 'supabase/mcp',
    mention_count: 0,
    install_count: 140,
    avg_rating: 4.5,
    rating_count: 11,
    featured: true,
    created_at: '2026-09-01T00:00:00Z',
  }),
  entry({
    id: 'tool-6',
    slug: 'mcp-servers-reference',
    name: 'MCP Reference Servers',
    one_liner: 'filesystem·fetch 등 공식 레퍼런스 서버 모음',
    description: 'modelcontextprotocol/servers — 스펙 참고용 공식 예제.',
    type: 'mcp_server',
    tags: ['레퍼런스', 'filesystem', '학습'],
    canonical_url: 'https://github.com/modelcontextprotocol/servers',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    license: 'MIT',
    last_commit_at: '2026-11-12T00:00:00Z',
    source_repo: 'modelcontextprotocol/servers',
    mention_count: 0,
    install_count: 320,
    avg_rating: 4.4,
    rating_count: 22,
    featured: false,
    created_at: '2026-08-01T00:00:00Z',
  }),
  entry({
    id: 'tool-7',
    slug: 'anthropic-skills',
    name: 'Anthropic Skills',
    one_liner: 'Claude용 공식 Agent Skills 카탈로그',
    description: 'anthropics/skills — SKILL.md 기반 스킬 모음.',
    type: 'agent_skill',
    tags: ['스킬', 'claude', '워크플로'],
    canonical_url: 'https://github.com/anthropics/skills',
    github_url: 'https://github.com/anthropics/skills',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-14T00:00:00Z',
    source_repo: 'anthropics/skills',
    mention_count: 0,
    install_count: 260,
    avg_rating: 4.8,
    rating_count: 16,
    featured: true,
    created_at: '2026-10-05T00:00:00Z',
  }),
  entry({
    id: 'tool-8',
    slug: 'claude-code',
    name: 'Claude Code',
    one_liner: '터미널 네이티브 Anthropic 코딩 에이전트',
    description: 'anthropics/claude-code — CLI 에이전트와 플러그인 생태계.',
    type: 'cli_tool',
    tags: ['에이전트', 'cli', 'claude'],
    canonical_url: 'https://github.com/anthropics/claude-code',
    github_url: 'https://github.com/anthropics/claude-code',
    license: 'Proprietary',
    last_commit_at: '2026-11-21T00:00:00Z',
    source_repo: 'anthropics/claude-code',
    mention_count: 0,
    install_count: 400,
    avg_rating: 4.7,
    rating_count: 30,
    featured: true,
    created_at: '2026-07-01T00:00:00Z',
  }),
  entry({
    id: 'tool-9',
    slug: 'firecrawl-mcp',
    name: 'Firecrawl MCP',
    one_liner: '웹 페이지를 LLM-ready 마크다운으로 크롤',
    description: 'firecrawl/firecrawl-mcp-server',
    type: 'mcp_server',
    tags: ['크롤링', '검색', '리서치'],
    canonical_url: 'https://github.com/firecrawl/firecrawl-mcp-server',
    github_url: 'https://github.com/firecrawl/firecrawl-mcp-server',
    license: 'MIT',
    last_commit_at: '2026-11-15T00:00:00Z',
    source_repo: 'firecrawl/firecrawl-mcp-server',
    mention_count: 0,
    install_count: 88,
    avg_rating: 4.3,
    rating_count: 7,
    featured: false,
    created_at: '2026-10-12T00:00:00Z',
  }),
  entry({
    id: 'tool-10',
    slug: 'exa-mcp',
    name: 'Exa MCP',
    one_liner: '시맨틱 웹 검색을 에이전트 도구로',
    description: 'exa-labs/exa-mcp-server',
    type: 'mcp_server',
    tags: ['검색', '리서치', '웹'],
    canonical_url: 'https://github.com/exa-labs/exa-mcp-server',
    github_url: 'https://github.com/exa-labs/exa-mcp-server',
    license: 'MIT',
    last_commit_at: '2026-11-10T00:00:00Z',
    source_repo: 'exa-labs/exa-mcp-server',
    mention_count: 0,
    install_count: 72,
    avg_rating: 4.2,
    rating_count: 5,
    featured: false,
    created_at: '2026-10-18T00:00:00Z',
  }),
  entry({
    id: 'tool-11',
    slug: 'brave-search-mcp',
    name: 'Brave Search MCP',
    one_liner: 'Brave Search API를 MCP로',
    description: 'brave/brave-search-mcp-server',
    type: 'mcp_server',
    tags: ['검색', '프라이버시'],
    canonical_url: 'https://github.com/brave/brave-search-mcp-server',
    github_url: 'https://github.com/brave/brave-search-mcp-server',
    license: 'MIT',
    last_commit_at: '2026-11-08T00:00:00Z',
    source_repo: 'brave/brave-search-mcp-server',
    mention_count: 0,
    install_count: 61,
    avg_rating: 4.1,
    rating_count: 4,
    featured: false,
    created_at: '2026-10-22T00:00:00Z',
  }),
  entry({
    id: 'tool-12',
    slug: 'browserbase-mcp',
    name: 'Browserbase MCP',
    one_liner: '클라우드 브라우저 세션을 MCP로 제어',
    description: 'browserbase/mcp-server-browserbase',
    type: 'mcp_server',
    tags: ['브라우저', '클라우드', '자동화'],
    canonical_url: 'https://github.com/browserbase/mcp-server-browserbase',
    github_url: 'https://github.com/browserbase/mcp-server-browserbase',
    license: 'MIT',
    last_commit_at: '2026-11-11T00:00:00Z',
    source_repo: 'browserbase/mcp-server-browserbase',
    mention_count: 0,
    install_count: 54,
    avg_rating: 4.0,
    rating_count: 3,
    featured: false,
    created_at: '2026-10-25T00:00:00Z',
  }),
  entry({
    id: 'tool-13',
    slug: 'openai-codex',
    name: 'OpenAI Codex CLI',
    one_liner: 'OpenAI의 터미널 코딩 에이전트',
    description: 'openai/codex — 로컬 워크트리에서 작업하는 CLI.',
    type: 'cli_tool',
    tags: ['에이전트', 'cli', 'openai'],
    canonical_url: 'https://github.com/openai/codex',
    github_url: 'https://github.com/openai/codex',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-19T00:00:00Z',
    source_repo: 'openai/codex',
    mention_count: 0,
    install_count: 190,
    avg_rating: 4.4,
    rating_count: 10,
    featured: true,
    created_at: '2026-09-20T00:00:00Z',
  }),
  entry({
    id: 'tool-14',
    slug: 'gemini-cli',
    name: 'Gemini CLI',
    one_liner: 'Google Gemini 터미널 에이전트',
    description: 'google-gemini/gemini-cli',
    type: 'cli_tool',
    tags: ['에이전트', 'cli', 'gemini'],
    canonical_url: 'https://github.com/google-gemini/gemini-cli',
    github_url: 'https://github.com/google-gemini/gemini-cli',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-18T00:00:00Z',
    source_repo: 'google-gemini/gemini-cli',
    mention_count: 0,
    install_count: 150,
    avg_rating: 4.3,
    rating_count: 8,
    featured: false,
    created_at: '2026-09-25T00:00:00Z',
  }),
  entry({
    id: 'tool-15',
    slug: 'aider',
    name: 'Aider',
    one_liner: 'Git 친화적 AI 페어 프로그래밍 CLI',
    description: 'Aider-AI/aider — 커밋 단위로 코드 수정.',
    type: 'cli_tool',
    tags: ['페어프로그래밍', 'git', 'cli'],
    canonical_url: 'https://github.com/Aider-AI/aider',
    github_url: 'https://github.com/Aider-AI/aider',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-13T00:00:00Z',
    source_repo: 'Aider-AI/aider',
    mention_count: 0,
    install_count: 175,
    avg_rating: 4.6,
    rating_count: 13,
    featured: false,
    created_at: '2026-08-15T00:00:00Z',
  }),
  entry({
    id: 'tool-16',
    slug: 'continue',
    name: 'Continue',
    one_liner: '오픈소스 IDE 코딩 어시스턴트',
    description: 'continuedev/continue — VS Code/JetBrains 확장 + 커스텀 모델.',
    type: 'saas_service',
    tags: ['ide', '오픈소스', '어시스턴트'],
    canonical_url: 'https://github.com/continuedev/continue',
    github_url: 'https://github.com/continuedev/continue',
    homepage_url: 'https://continue.dev',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-17T00:00:00Z',
    source_repo: 'continuedev/continue',
    mention_count: 0,
    install_count: 110,
    avg_rating: 4.2,
    rating_count: 6,
    featured: false,
    created_at: '2026-08-20T00:00:00Z',
  }),
  entry({
    id: 'tool-17',
    slug: 'vercel-ai-sdk',
    name: 'Vercel AI SDK',
    one_liner: 'TypeScript AI 앱 툴킷 (스트리밍·툴콜)',
    description: 'vercel/ai — Next.js/RSC와 잘 맞는 AI SDK.',
    type: 'saas_service',
    tags: ['sdk', 'typescript', '스트리밍'],
    canonical_url: 'https://github.com/vercel/ai',
    github_url: 'https://github.com/vercel/ai',
    homepage_url: 'https://sdk.vercel.ai',
    license: 'Apache-2.0',
    last_commit_at: '2026-11-20T00:00:00Z',
    source_repo: 'vercel/ai',
    mention_count: 0,
    install_count: 230,
    avg_rating: 4.7,
    rating_count: 15,
    featured: true,
    created_at: '2026-07-10T00:00:00Z',
  }),
  entry({
    id: 'tool-18',
    slug: 'mcp-typescript-sdk',
    name: 'MCP TypeScript SDK',
    one_liner: 'MCP 서버/클라이언트를 TS로 구현',
    description: 'modelcontextprotocol/typescript-sdk',
    type: 'mcp_server',
    tags: ['sdk', 'mcp', 'typescript'],
    canonical_url: 'https://github.com/modelcontextprotocol/typescript-sdk',
    github_url: 'https://github.com/modelcontextprotocol/typescript-sdk',
    license: 'MIT',
    last_commit_at: '2026-11-16T00:00:00Z',
    source_repo: 'modelcontextprotocol/typescript-sdk',
    mention_count: 0,
    install_count: 200,
    avg_rating: 4.5,
    rating_count: 9,
    featured: false,
    created_at: '2026-08-05T00:00:00Z',
  }),
  entry({
    id: 'tool-19',
    slug: 'awesome-mcp-servers',
    name: 'Awesome MCP Servers',
    one_liner: '커뮤니티 MCP 서버 큐레이션 리스트',
    description: 'punkpeye/awesome-mcp-servers — 탐색용 인덱스.',
    type: 'mcp_server',
    tags: ['디렉터리', '큐레이션', 'mcp'],
    canonical_url: 'https://github.com/punkpeye/awesome-mcp-servers',
    github_url: 'https://github.com/punkpeye/awesome-mcp-servers',
    license: 'MIT',
    last_commit_at: '2026-11-21T00:00:00Z',
    source_repo: 'punkpeye/awesome-mcp-servers',
    mention_count: 0,
    install_count: 40,
    avg_rating: 4.0,
    rating_count: 4,
    featured: false,
    created_at: '2026-11-01T00:00:00Z',
  }),
  entry({
    id: 'tool-20',
    slug: 'ollama',
    name: 'Ollama',
    one_liner: '로컬 LLM 런타임 — 모델 pull & serve',
    description: 'ollama/ollama — 로컬에서 모델 실행.',
    type: 'cli_tool',
    tags: ['로컬llm', '추론', '오프라인'],
    canonical_url: 'https://github.com/ollama/ollama',
    github_url: 'https://github.com/ollama/ollama',
    homepage_url: 'https://ollama.com',
    license: 'MIT',
    last_commit_at: '2026-11-19T00:00:00Z',
    source_repo: 'ollama/ollama',
    mention_count: 0,
    install_count: 350,
    avg_rating: 4.8,
    rating_count: 25,
    featured: true,
    created_at: '2026-06-01T00:00:00Z',
  }),
  entry({
    id: 'tool-21',
    slug: 'dspy',
    name: 'DSPy',
    one_liner: '프로그래밍 방식으로 프롬프트/파이프라인 최적화',
    description: 'stanfordnlp/dspy',
    type: 'cli_tool',
    tags: ['프롬프트', '파이프라인', '연구'],
    canonical_url: 'https://github.com/stanfordnlp/dspy',
    github_url: 'https://github.com/stanfordnlp/dspy',
    license: 'MIT',
    last_commit_at: '2026-11-09T00:00:00Z',
    source_repo: 'stanfordnlp/dspy',
    mention_count: 0,
    install_count: 90,
    avg_rating: 4.4,
    rating_count: 7,
    featured: false,
    created_at: '2026-09-05T00:00:00Z',
  }),
  entry({
    id: 'tool-22',
    slug: 'anthropic-courses',
    name: 'Anthropic Courses',
    one_liner: 'Anthropic 공식 교육 코스·프롬프트 자료',
    description: 'anthropics/courses — 프롬프트/에이전트 학습 자료.',
    type: 'prompt',
    tags: ['학습', '프롬프트', 'claude'],
    canonical_url: 'https://github.com/anthropics/courses',
    github_url: 'https://github.com/anthropics/courses',
    license: 'MIT',
    last_commit_at: '2026-10-30T00:00:00Z',
    source_repo: 'anthropics/courses',
    mention_count: 0,
    install_count: 70,
    avg_rating: 4.5,
    rating_count: 6,
    featured: false,
    created_at: '2026-10-01T00:00:00Z',
  }),
]

function cloneEntries(list: ToolboxEntry[]): ToolboxEntry[] {
  return list.map((e) => ({
    ...e,
    tags: [...e.tags],
    install_snippets: { ...e.install_snippets },
  }))
}

export let MUTABLE_TOOLBOX: ToolboxEntry[] = cloneEntries(SEED)

export let MUTABLE_MENTIONS: ToolboxMention[] = []

export let MUTABLE_REVIEWS: ToolboxReview[] = [
  {
    id: 'tr-1',
    entry_id: 'tool-1',
    member_id: 'member-1',
    rating: 5,
    body: 'PR 리뷰 루프에 바로 붙였어요. read-only 헤더 필수.',
    created_at: '2026-11-10T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
  },
  {
    id: 'tr-2',
    entry_id: 'tool-2',
    member_id: 'member-2',
    rating: 5,
    body: '문서 환각이 확 줄었습니다. Cursor 기본 세팅으로 추천.',
    created_at: '2026-11-12T00:00:00Z',
    updated_at: '2026-11-12T00:00:00Z',
  },
  {
    id: 'tr-3',
    entry_id: 'tool-7',
    member_id: 'member-3',
    rating: 4,
    body: 'SKILL.md 구조가 깔끔. 팀 스킬 템플릿으로 씀.',
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
  },
]

export let MUTABLE_COMPAT: ToolboxCompatVote[] = [
  {
    id: 'tc-1',
    entry_id: 'tool-1',
    member_id: 'member-1',
    environment: 'cursor',
    works: true,
    created_at: '2026-11-10T00:00:00Z',
  },
  {
    id: 'tc-2',
    entry_id: 'tool-1',
    member_id: 'member-2',
    environment: 'claude_desktop',
    works: true,
    created_at: '2026-11-11T00:00:00Z',
  },
  {
    id: 'tc-3',
    entry_id: 'tool-2',
    member_id: 'member-1',
    environment: 'cursor',
    works: true,
    created_at: '2026-11-12T00:00:00Z',
  },
  {
    id: 'tc-4',
    entry_id: 'tool-2',
    member_id: 'member-3',
    environment: 'claude_code',
    works: true,
    created_at: '2026-11-13T00:00:00Z',
  },
  {
    id: 'tc-5',
    entry_id: 'tool-13',
    member_id: 'member-2',
    environment: 'codex_cli',
    works: true,
    created_at: '2026-11-14T00:00:00Z',
  },
]

/** Scan posts for tool URLs and upsert mentions (idempotent) */
export function aggregateMentionsFromPosts(posts = MOCK_POSTS) {
  for (const post of posts) {
    if (!post.url || !isToolishUrl(post.url)) continue
    const key = canonicalUrl(post.url)
    let found = MUTABLE_TOOLBOX.find((e) => canonicalUrl(e.canonical_url) === key)
    if (!found) {
      const name = post.link_title || key
      const result = upsertByCanonicalUrl(MUTABLE_TOOLBOX, {
        slug: key.split('/').filter(Boolean).slice(-2).join('-') || `auto-${post.id}`,
        name,
        one_liner: post.link_description || `${name} — 커뮤니티에서 언급됨`,
        description: post.link_description || '',
        type: 'mcp_server',
        tags: ['커뮤니티언급'],
        canonical_url: key,
        github_url: key.includes('github.com') ? key : null,
        mention_count: 0,
        install_count: 0,
        avg_rating: 0,
        rating_count: 0,
        featured: false,
        install_snippets: {},
        license: null,
        last_commit_at: null,
        source_repo: null,
        icon_url: post.link_favicon,
        homepage_url: null,
        created_by_id: null,
      })
      MUTABLE_TOOLBOX = result.entries
      found = result.entry
    }
    const { mentions, added } = recordMention(
      MUTABLE_MENTIONS,
      found.id,
      post.id,
      key
    )
    MUTABLE_MENTIONS = mentions
    if (added) {
      found.mention_count = MUTABLE_MENTIONS.filter((m) => m.entry_id === found!.id).length
      found.updated_at = new Date().toISOString()
    }
  }
  // refresh counts
  for (const e of MUTABLE_TOOLBOX) {
    e.mention_count = MUTABLE_MENTIONS.filter((m) => m.entry_id === e.id).length
  }
}

// Seed mentions from existing posts (vercel/ai etc.)
aggregateMentionsFromPosts()

// Extra explicit mentions for popular tools (as if linked from posts)
for (const [entryId, postId, url] of [
  ['tool-1', 'post-1', 'https://github.com/github/github-mcp-server'],
  ['tool-1', 'post-3', 'https://github.com/github/github-mcp-server'],
  ['tool-2', 'post-2', 'https://github.com/upstash/context7'],
  ['tool-7', 'post-1', 'https://github.com/anthropics/skills'],
  ['tool-3', 'post-3', 'https://github.com/microsoft/playwright-mcp'],
] as const) {
  const { mentions, added } = recordMention(MUTABLE_MENTIONS, entryId, postId, url)
  MUTABLE_MENTIONS = mentions
  if (added) {
    const e = MUTABLE_TOOLBOX.find((x) => x.id === entryId)
    if (e) e.mention_count = MUTABLE_MENTIONS.filter((m) => m.entry_id === entryId).length
  }
}

export function getToolboxEntry(idOrSlug: string): ToolboxEntryDetails | null {
  const e =
    MUTABLE_TOOLBOX.find((x) => x.id === idOrSlug || x.slug === idOrSlug) || null
  if (!e) return null
  const reviews = MUTABLE_REVIEWS.filter((r) => r.entry_id === e.id)
  const rating = recomputeRating(MUTABLE_REVIEWS, e.id)
  return {
    ...e,
    avg_rating: rating.count ? rating.avg : e.avg_rating,
    rating_count: rating.count || e.rating_count,
    mentions: MUTABLE_MENTIONS.filter((m) => m.entry_id === e.id),
    reviews,
    compat: compatSummary(MUTABLE_COMPAT, e.id),
  }
}

export function listToolbox(opts?: {
  type?: string
  tag?: string
  q?: string
  sort?: ToolboxSort
}): ToolboxEntry[] {
  let list = [...MUTABLE_TOOLBOX]
  if (opts?.type) list = list.filter((e) => e.type === opts.type)
  if (opts?.tag) list = list.filter((e) => e.tags.includes(opts.tag!))
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.one_liner.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }
  return sortEntries(list, opts?.sort || 'trending')
}

export function featuredToolbox(limit = 4): ToolboxEntry[] {
  return listToolbox({ sort: 'trending' })
    .filter((e) => e.featured)
    .slice(0, limit)
}

export function resetToolboxStore() {
  MUTABLE_TOOLBOX = cloneEntries(SEED)
  MUTABLE_MENTIONS = []
  MUTABLE_REVIEWS = [
    {
      id: 'tr-1',
      entry_id: 'tool-1',
      member_id: 'member-1',
      rating: 5,
      body: 'PR 리뷰 루프에 바로 붙였어요. read-only 헤더 필수.',
      created_at: '2026-11-10T00:00:00Z',
      updated_at: '2026-11-10T00:00:00Z',
    },
  ]
  MUTABLE_COMPAT = []
  aggregateMentionsFromPosts()
  for (const [entryId, postId, url] of [
    ['tool-1', 'post-1', 'https://github.com/github/github-mcp-server'],
    ['tool-1', 'post-3', 'https://github.com/github/github-mcp-server'],
    ['tool-2', 'post-2', 'https://github.com/upstash/context7'],
    ['tool-7', 'post-1', 'https://github.com/anthropics/skills'],
    ['tool-3', 'post-3', 'https://github.com/microsoft/playwright-mcp'],
  ] as const) {
    const { mentions, added } = recordMention(MUTABLE_MENTIONS, entryId, postId, url)
    MUTABLE_MENTIONS = mentions
    if (added) {
      const e = MUTABLE_TOOLBOX.find((x) => x.id === entryId)
      if (e) e.mention_count = MUTABLE_MENTIONS.filter((m) => m.entry_id === entryId).length
    }
  }
}
