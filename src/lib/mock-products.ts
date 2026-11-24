import type {
  Product,
  ProductComment,
  ProductUpdate,
  ProductUpvote,
  PublicAuthor,
} from '@/lib/supabase/types'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { nicknameProfilePublicId, toPublicAuthor } from '@/lib/profile'
import { countUpvotes, rankProducts, type RankingWindow } from '@/lib/product-rules'
import type { ProductWithDetails } from '@/lib/data/types'

export type { ProductWithDetails } from '@/lib/data/types'

export let MUTABLE_UPVOTES: ProductUpvote[] = [
  {
    id: 'upvote-1',
    product_id: 'product-1',
    member_id: 'member-2',
    created_at: '2026-11-20T08:00:00Z',
  },
  {
    id: 'upvote-2',
    product_id: 'product-1',
    member_id: 'member-3',
    created_at: '2026-11-21T02:00:00Z',
  },
  {
    id: 'upvote-3',
    product_id: 'product-2',
    member_id: 'member-1',
    created_at: '2026-11-19T10:00:00Z',
  },
  {
    id: 'upvote-4',
    product_id: 'product-2',
    member_id: 'member-3',
    created_at: '2026-11-21T14:00:00Z',
  },
  {
    id: 'upvote-5',
    product_id: 'product-3',
    member_id: 'member-1',
    created_at: '2026-11-18T06:00:00Z',
  },
  {
    id: 'upvote-6',
    product_id: 'product-1',
    member_id: 'member-1',
    created_at: '2026-11-15T09:00:00Z',
  },
  {
    id: 'upvote-7',
    product_id: 'product-4',
    member_id: 'member-2',
    created_at: '2026-12-01T04:00:00Z',
  },
]

const COMMENTS: ProductComment[] = [
  {
    id: 'pcomment-1',
    product_id: 'product-1',
    member_id: 'member-3',
    posted_as: 'real',
    nickname_profile_id: null,
    body: 'MCP 도구 목록이 깔끔하네요. Cursor 룰과 같이 쓰면 좋을 듯.',
    created_at: '2026-11-20T12:00:00Z',
  },
  {
    id: 'pcomment-2',
    product_id: 'product-2',
    member_id: 'member-1',
    posted_as: 'nickname',
    nickname_profile_id: nicknameProfilePublicId('6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5'),
    body: '주간 리포트 자동화가 핵심이군요. 써볼게요.',
    created_at: '2026-11-19T15:00:00Z',
  },
]

const UPDATES: ProductUpdate[] = [
  {
    id: 'pupdate-1',
    product_id: 'product-1',
    title: 'v0.2 — 배치 실행',
    body: '여러 MCP 서버를 한 번에 스모크 테스트하는 배치 모드를 추가했습니다.',
    created_at: '2026-11-22T00:00:00Z',
  },
  {
    id: 'pupdate-2',
    product_id: 'product-2',
    title: '슬랙 알림 연동',
    body: '주간 다이제스트를 슬랙으로 보낼 수 있습니다.',
    created_at: '2026-12-02T00:00:00Z',
  },
]

const SEED_PRODUCTS: Product[] = [
  {
    id: 'product-1',
    name: 'MCP Lab Bench',
    tagline: '로컬 MCP 서버를 한 화면에서 스모크 테스트',
    description: `Cursor / Claude Desktop에 붙인 MCP 서버의 도구·리소스를 빠르게 검증하는 데스크톱 유틸입니다.

- 도구 스키마 미리보기
- 샘플 호출 + 응답 로그
- 실패 시 재시도 큐

오픈소스이며 커뮤니티 피드백을 환영합니다.`,
    logo_url: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=200&h=200&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200',
    ],
    website_url: 'https://example.com/mcp-lab-bench',
    app_store_url: null,
    github_url: 'https://github.com/example/mcp-lab-bench',
    tags: ['MCP', '개발도구', '오픈소스'],
    maker_ids: ['member-1', 'member-2'],
    launch_post_id: 'post-2',
    featured: true,
    created_at: '2026-11-14T00:00:00Z',
    updated_at: '2026-11-22T00:00:00Z',
    launched_at: '2026-11-15T09:00:00+09:00',
  },
  {
    id: 'product-2',
    name: '에이전트 위클리',
    tagline: '팀 Cursor 사용 로그를 주간 다이제스트로',
    description: `팀원들의 에이전트 세션·룰·스킬 사용량을 모아 매주 월요일 리포트를 만듭니다.`,
    logo_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=200&h=200&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200',
    ],
    website_url: 'https://example.com/agent-weekly',
    app_store_url: null,
    github_url: 'https://github.com/example/agent-weekly',
    tags: ['생산성', '팀', '리포트'],
    maker_ids: ['member-2'],
    launch_post_id: null,
    featured: true,
    created_at: '2026-11-17T00:00:00Z',
    updated_at: '2026-12-02T00:00:00Z',
    launched_at: '2026-11-18T10:00:00+09:00',
  },
  {
    id: 'product-3',
    name: 'Prompt Shelf',
    tagline: '프롬프트를 선반처럼 정리하는 개인 라이브러리',
    description: `태그·버전·사용 횟수로 프롬프트를 관리합니다. AI쓰발 게시물과 연동 예정입니다.`,
    logo_url: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=200&h=200&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1432888498266-38ffec3bdb36?w=1200',
    ],
    website_url: 'https://example.com/prompt-shelf',
    app_store_url: 'https://apps.apple.com/app/id000000',
    github_url: null,
    tags: ['프롬프트', '개인도구'],
    maker_ids: ['member-3'],
    launch_post_id: null,
    featured: false,
    created_at: '2026-11-10T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z',
    launched_at: '2026-11-12T14:00:00+09:00',
  },
  {
    id: 'product-4',
    name: 'KST Meet Sync',
    tagline: '오프라인 모임을 캘린더·지도에 한 번에',
    description: `AI쓰발 모임 RSVP를 Google Calendar와 네이버 지도 링크로 동기화하는 실험작.`,
    logo_url: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=200&h=200&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=1200',
    ],
    website_url: null,
    app_store_url: null,
    github_url: 'https://github.com/example/kst-meet-sync',
    tags: ['모임', '캘린더', '실험'],
    maker_ids: ['member-1'],
    launch_post_id: null,
    featured: false,
    created_at: '2026-11-28T00:00:00Z',
    updated_at: '2026-12-01T00:00:00Z',
    launched_at: '2026-12-01T11:00:00+09:00',
  },
]

/** A87: one store per server process; route handlers and pages load separate module copies in a prod build (like mock-social) */
const gp = globalThis as unknown as { __aisubalProducts?: Product[] }
export const MOCK_PRODUCTS: Product[] = (gp.__aisubalProducts ??= SEED_PRODUCTS)

function makerAuthors(ids: string[]): PublicAuthor[] {
  // A87: a launch made in DEV by the signed-in seed user (not in MOCK_MEMBERS) has no mock author row
  return ids.flatMap((id) => {
    const m = MOCK_MEMBERS.find((x) => x.id === id)
    return m ? [toPublicAuthor(m, 'real')] : []
  })
}

function commentAuthors(c: ProductComment): PublicAuthor {
  const m = MOCK_MEMBERS.find((x) => x.id === c.member_id)!
  return toPublicAuthor(m, c.posted_as)
}

export function resetProductUpvotes() {
  MUTABLE_UPVOTES = [
    {
      id: 'upvote-1',
      product_id: 'product-1',
      member_id: 'member-2',
      created_at: '2026-11-20T08:00:00Z',
    },
    {
      id: 'upvote-2',
      product_id: 'product-1',
      member_id: 'member-3',
      created_at: '2026-11-21T02:00:00Z',
    },
    {
      id: 'upvote-3',
      product_id: 'product-2',
      member_id: 'member-1',
      created_at: '2026-11-19T10:00:00Z',
    },
    {
      id: 'upvote-4',
      product_id: 'product-2',
      member_id: 'member-3',
      created_at: '2026-11-21T14:00:00Z',
    },
    {
      id: 'upvote-5',
      product_id: 'product-3',
      member_id: 'member-1',
      created_at: '2026-11-18T06:00:00Z',
    },
    {
      id: 'upvote-6',
      product_id: 'product-1',
      member_id: 'member-1',
      created_at: '2026-11-15T09:00:00Z',
    },
    {
      id: 'upvote-7',
      product_id: 'product-4',
      member_id: 'member-2',
      created_at: '2026-12-01T04:00:00Z',
    },
  ]
}

export function getProductDetails(
  productId: string,
  viewerId?: string
): ProductWithDetails | null {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId)
  if (!product) return null
  const comments = COMMENTS.filter((c) => c.product_id === productId).map((c) => ({
    ...c,
    author: commentAuthors(c),
  }))
  return {
    ...product,
    makers: makerAuthors(product.maker_ids),
    upvote_count: countUpvotes(MUTABLE_UPVOTES, productId),
    comments,
    updates: UPDATES.filter((u) => u.product_id === productId),
    user_upvoted: viewerId
      ? MUTABLE_UPVOTES.some((u) => u.product_id === productId && u.member_id === viewerId)
      : false,
  }
}

export function listProductsRanked(
  window: RankingWindow = 'all',
  viewerId?: string,
  now = new Date('2026-11-21T12:00:00+09:00')
): ProductWithDetails[] {
  const ranked = rankProducts(
    MOCK_PRODUCTS.map((p) => p.id),
    MUTABLE_UPVOTES,
    window,
    now
  )
  return ranked
    .map((r) => getProductDetails(r.productId, viewerId))
    .filter((p): p is ProductWithDetails => Boolean(p))
}

export function featuredProducts(limit = 3, viewerId?: string): ProductWithDetails[] {
  return MOCK_PRODUCTS.filter((p) => p.featured)
    .slice(0, limit)
    .map((p) => getProductDetails(p.id, viewerId)!)
}
