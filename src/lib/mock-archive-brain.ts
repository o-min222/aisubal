import type {
  ArchiveCollection,
  ArchiveHighlight,
  ArchiveSourceType,
  BrainArchiveItem,
  Member,
} from '@/lib/supabase/types'
import { MOCK_POSTS } from '@/lib/mock-data'
import { mockMoims } from '@/lib/data/moim'
import { MOCK_PRODUCTS } from '@/lib/mock-products'
import { MUTABLE_TOOLBOX } from '@/lib/mock-toolbox'
import {
  collectionContextBundle,
  findExisting,
  itemToLlmContext,
  normalizeTags,
  searchArchiveItems,
  upsertArchiveItem,
  useInAiPrompt,
} from '@/lib/archive-brain-rules'

const OWNER = 'dev-user-id' // DEV_BYPASS member

export let MUTABLE_COLLECTIONS: ArchiveCollection[] = [
  {
    id: 'col-agent-stack',
    owner_id: OWNER,
    name: '에이전트 스택',
    description: 'Cursor/Claude 워크플로에 쓸 MCP·스킬·프롬프트',
    is_shared: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
  },
  {
    id: 'col-community-shared',
    owner_id: OWNER,
    name: '커뮤니티 공유 노트',
    description: '멤버에게 공개하는 큐레이션 (선택 공유)',
    is_shared: true,
    created_at: '2026-11-10T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z',
  },
]

function fromPost(
  postId: string,
  extras: Partial<BrainArchiveItem> = {}
): BrainArchiveItem {
  const post = MOCK_POSTS.find((p) => p.id === postId)!
  const extracted =
    post.link_type === 'youtube'
      ? `[YouTube transcript placeholder]\nTitle: ${post.link_title}\nURL: ${post.url}\n\n(실서비스에서는 캡션/트랜스크립트 API로 채웁니다.)`
      : post.link_type === 'article' || post.link_type === 'github'
        ? `[Fetched article / README excerpt]\n${post.link_description || ''}\n\n${post.content.slice(0, 400)}`
        : null
  return {
    id: `ba-${postId}`,
    owner_id: OWNER,
    source_type: post.url ? 'link' : 'post',
    source_id: post.id,
    title: post.title,
    summary: post.link_description || post.content.slice(0, 120),
    content_text: `# ${post.title}\n\n${post.content}${
      post.assets.length
        ? '\n\n## Assets\n' +
          post.assets.map((a) => `### ${a.name} (${a.type})\n${a.content}`).join('\n')
        : ''
    }`,
    source_url: post.url,
    extracted_text: extracted,
    tags: extras.tags || [],
    note: extras.note || null,
    collection_ids: extras.collection_ids || [],
    created_at: extras.created_at || '2026-11-18T12:00:00Z',
    updated_at: extras.updated_at || '2026-11-18T12:00:00Z',
  }
}

export let MUTABLE_BRAIN: BrainArchiveItem[] = [
  {
    ...fromPost('post-1', {
      tags: ['youtube', '에이전트', 'karpathy'],
      note: '툴 호출 전 계획 쓰기 — 우리 룰에 넣을 것',
      collection_ids: ['col-agent-stack'],
    }),
  },
  {
    ...fromPost('post-2', {
      tags: ['mcp', 'vercel', 'typescript'],
      note: null,
      collection_ids: ['col-agent-stack', 'col-community-shared'],
      created_at: '2026-11-17T10:00:00Z',
      updated_at: '2026-11-17T10:00:00Z',
    }),
  },
  {
    ...fromPost('post-3', {
      tags: ['git', '커밋', 'rules'],
      note: '커밋 메시지 프롬프트 섹션 하이라이트',
      collection_ids: ['col-community-shared'],
      created_at: '2026-11-16T09:00:00Z',
      updated_at: '2026-11-16T09:00:00Z',
    }),
  },
  (() => {
    const tool = MUTABLE_TOOLBOX.find((t) => t.slug === 'github-mcp-server')!
    return {
      id: 'ba-toolbox-github-mcp',
      owner_id: OWNER,
      source_type: 'toolbox' as const,
      source_id: tool.id,
      title: tool.name,
      summary: tool.one_liner,
      content_text: `${tool.description}\n\nInstall (cursor):\n${tool.install_snippets.cursor || ''}`,
      source_url: tool.canonical_url,
      extracted_text: null,
      tags: ['mcp', 'github'],
      note: 'read-only 헤더 켜고 쓰기',
      collection_ids: ['col-agent-stack'],
      created_at: '2026-11-15T08:00:00Z',
      updated_at: '2026-11-15T08:00:00Z',
    }
  })(),
  (() => {
    const tool = MUTABLE_TOOLBOX.find((t) => t.slug === 'context7')!
    return {
      id: 'ba-toolbox-context7',
      owner_id: OWNER,
      source_type: 'toolbox' as const,
      source_id: tool.id,
      title: tool.name,
      summary: tool.one_liner,
      content_text: tool.description,
      source_url: tool.canonical_url,
      extracted_text: null,
      tags: ['mcp', '문서'],
      note: null,
      collection_ids: ['col-agent-stack'],
      created_at: '2026-11-14T08:00:00Z',
      updated_at: '2026-11-14T08:00:00Z',
    }
  })(),
  (() => {
    const m = mockMoims().find((x) => x.id === 'moim-1')!
    return {
      id: 'ba-meetup-1',
      owner_id: OWNER,
      source_type: 'meetup' as const,
      source_id: m.id,
      title: m.title,
      summary: m.venueName || m.mode,
      content_text: m.description,
      source_url: null,
      extracted_text: null,
      tags: ['오프라인', 'cursor'],
      note: '노트북 챙기기',
      collection_ids: [],
      created_at: '2026-11-19T08:00:00Z',
      updated_at: '2026-11-19T08:00:00Z',
    }
  })(),
  (() => {
    const p = MOCK_PRODUCTS.find((x) => x.id === 'product-1')!
    return {
      id: 'ba-product-1',
      owner_id: OWNER,
      source_type: 'product' as const,
      source_id: p.id,
      title: p.name,
      summary: p.tagline,
      content_text: p.description,
      source_url: p.website_url || p.github_url,
      extracted_text: null,
      tags: ['mcp', '프로덕트'],
      note: '팀 온보딩에 추천',
      collection_ids: ['col-community-shared'],
      created_at: '2026-11-13T08:00:00Z',
      updated_at: '2026-11-13T08:00:00Z',
    }
  })(),
  (() => {
    const asset = MOCK_POSTS.find((p) => p.id === 'post-2')!.assets[0]
    return {
      id: 'ba-asset-mcp',
      owner_id: OWNER,
      source_type: 'asset' as const,
      source_id: asset.id,
      title: `${asset.name} (${asset.type})`,
      summary: '게시물 첨부 MCP 설정',
      content_text: asset.content,
      source_url: null,
      extracted_text: null,
      tags: ['mcp', 'config'],
      note: null,
      collection_ids: ['col-agent-stack'],
      created_at: '2026-11-12T08:00:00Z',
      updated_at: '2026-11-12T08:00:00Z',
    }
  })(),
  {
    id: 'ba-post-note',
    owner_id: OWNER,
    source_type: 'post' as const,
    source_id: 'post-note-seed',
    title: '에이전트 디버깅 체크리스트 (메모)',
    summary: '링크 없는 텍스트 게시물 시드',
    content_text:
      '1) 도구 호출 전 계획 적기\n2) 컨텍스트 창 넘치면 요약 후 재시작\n3) MCP 권한은 최소 권한으로',
    source_url: null,
    extracted_text: null,
    tags: ['에이전트', '메모'],
    note: '게시물 타입 시드',
    collection_ids: ['col-agent-stack'],
    created_at: '2026-11-11T08:00:00Z',
    updated_at: '2026-11-11T08:00:00Z',
  },
]

export let MUTABLE_HIGHLIGHTS: ArchiveHighlight[] = [
  {
    id: 'hl-1',
    item_id: 'ba-post-1',
    owner_id: OWNER,
    quote: '툴 호출 전에 계획을 쓰게 하는',
    note: '에이전트 루프 핵심',
    created_at: '2026-11-18T13:00:00Z',
  },
  {
    id: 'hl-2',
    item_id: 'ba-post-3',
    owner_id: OWNER,
    quote: '커밋 메시지 프롬프트',
    note: null,
    created_at: '2026-11-16T10:00:00Z',
  },
]

export function listBrainForOwner(
  ownerId: string,
  opts?: {
    q?: string
    type?: ArchiveSourceType | 'all'
    tag?: string
    collectionId?: string
  }
) {
  return searchArchiveItems(MUTABLE_BRAIN, {
    ownerId,
    ...opts,
  })
}

export function getBrainItem(id: string, viewerId: string): BrainArchiveItem | null {
  const item = MUTABLE_BRAIN.find((i) => i.id === id)
  if (!item) return null
  if (item.owner_id === viewerId) return item
  const shared = item.collection_ids.some((cid) => {
    const c = MUTABLE_COLLECTIONS.find((x) => x.id === cid)
    return Boolean(c?.is_shared)
  })
  return shared ? item : null
}

export function getCollection(id: string, viewerId: string): ArchiveCollection | null {
  const c = MUTABLE_COLLECTIONS.find((x) => x.id === id)
  if (!c) return null
  if (c.owner_id === viewerId || c.is_shared) return c
  return null
}

export function saveAnything(
  owner: Member,
  input: {
    source_type: ArchiveSourceType
    source_id: string
    title: string
    summary?: string | null
    content_text: string
    source_url?: string | null
    extracted_text?: string | null
    tags?: string[] | string
    note?: string | null
    collection_ids?: string[]
  }
) {
  const result = upsertArchiveItem(MUTABLE_BRAIN, {
    owner_id: owner.id,
    source_type: input.source_type,
    source_id: input.source_id,
    title: input.title,
    summary: input.summary ?? null,
    content_text: input.content_text,
    source_url: input.source_url ?? null,
    extracted_text: input.extracted_text ?? null,
    tags: normalizeTags(input.tags),
    note: input.note ?? null,
    collection_ids: input.collection_ids || [],
  })
  MUTABLE_BRAIN = result.items
  return result
}

export function isSaved(
  ownerId: string,
  sourceType: ArchiveSourceType,
  sourceId: string
) {
  return Boolean(findExisting(MUTABLE_BRAIN, ownerId, sourceType, sourceId))
}

export function exportCollectionPack(collectionId: string, viewerId: string) {
  const collection = getCollection(collectionId, viewerId)
  if (!collection) return null
  const items = MUTABLE_BRAIN.filter((i) => i.collection_ids.includes(collectionId))
  const highlights = MUTABLE_HIGHLIGHTS.filter((h) =>
    items.some((i) => i.id === h.item_id)
  )
  return {
    collection,
    ...collectionContextBundle(collection, items, highlights),
    files: items.map((i) => ({
      filename: `${i.id}.md`,
      content: itemToLlmContext(i),
    })),
  }
}

export function buildUseInAi(itemId: string, viewerId: string) {
  const item = getBrainItem(itemId, viewerId)
  if (!item) return null
  return {
    prompt: useInAiPrompt(item),
    reference: `aisubal://archive/${item.id}`,
    markdown: itemToLlmContext(item),
  }
}

export function resetArchiveBrain() {
  // re-seed lightly for tests — keep structure
  MUTABLE_BRAIN = MUTABLE_BRAIN.map((i) => ({ ...i, tags: [...i.tags], collection_ids: [...i.collection_ids] }))
}
