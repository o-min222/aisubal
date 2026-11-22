import { NextRequest, NextResponse } from 'next/server'
import { getMember, isDevMode, getNicknameUnlockState } from '@/lib/auth'
import {
  listPosts,
  getPost,
  createPost,
  getPostAuthorMember,
  listMeetupsDetailed,
  getMeetupDetails,
  createMeetup,
  handleMeetupRsvp,
  listProductsRanked,
  getProductDetails,
  createProduct,
  listToolbox,
  getToolboxEntry,
  createToolboxEntry,
  recordToolboxInstall,
  listBrainForOwner,
  getBrainItem,
  listCollections,
  saveAnything,
  exportCollectionPack,
  buildUseInAi,
  getCollectionDetail,
  resolveArchiveSource,
} from '@/lib/data'
import type { PostWithDetails } from '@/lib/data/types'
import {
  itemToLlmContext,
  useInAiCollectionPrompt,
  collectionContextBundle,
} from '@/lib/archive-brain-rules'
import {
  canPostAs,
  publicAuthorLabel,
  toPublicPost,
  assertNoIdentityLeak,
} from '@/lib/profile'
import { detectLinkType } from '@/lib/link-preview'
import { TOOLBOX_ENV_LABEL } from '@/lib/toolbox-rules'
import type { ToolboxSort } from '@/lib/toolbox-rules'
import type { ArchiveSourceType, ToolboxEnvironment } from '@/lib/supabase/types'
import { AGORA_TOOLS, handleAgoraTool, isAgoraTool } from '@/lib/agora-mcp'
import { UNTRUSTED_NOTICE } from '@/lib/agora-rules'
import { createAnonClient } from '@/lib/supabase/anon'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
  id: string | number
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0' as const, error: { code, message }, id }
}

function jsonRpcSuccess(id: string | number, result: unknown) {
  return { jsonrpc: '2.0' as const, result, id }
}

const TOOLS = [
  {
    name: 'search_posts',
    description: '게시물 검색',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'read_post',
    description: '게시물 상세',
    inputSchema: {
      type: 'object',
      properties: { postId: { type: 'string' } },
      required: ['postId'],
    },
  },
  {
    name: 'create_post',
    description: '링크/코멘트 게시물 작성 (optional postedAs: real|nickname, url)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        url: { type: 'string' },
        postedAs: { type: 'string', enum: ['real', 'nickname'] },
        sourceNote: { type: 'string' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'list_archive',
    description: '레거시: 내 아카이브 요약. Scope: archive_read',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'search_archive',
    description: '세컨드 브레인 전문 검색. Scope: archive_read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string' },
        tag: { type: 'string' },
        collectionId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_archive_item',
    description: '아카이브 항목 전체 본문(추출문 포함). Scope: archive_read',
    inputSchema: {
      type: 'object',
      properties: { itemId: { type: 'string' } },
      required: ['itemId'],
    },
  },
  {
    name: 'list_collections',
    description: '아카이브 컬렉션 목록. Scope: archive_read',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_collection_context',
    description: '컬렉션 LLM 컨텍스트 번들. Scope: archive_read',
    inputSchema: {
      type: 'object',
      properties: { collectionId: { type: 'string' } },
      required: ['collectionId'],
    },
  },
  {
    name: 'save_to_archive',
    description: '임의 소스 저장. Scope: archive_write',
    inputSchema: {
      type: 'object',
      properties: {
        sourceType: { type: 'string' },
        sourceId: { type: 'string' },
        postId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'list_meetups',
    description: '모임 목록 (tab: upcoming|past). Scope: meetups_read',
    inputSchema: {
      type: 'object',
      properties: {
        tab: { type: 'string', enum: ['upcoming', 'past'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'read_meetup',
    description: '모임 상세. Scope: meetups_read',
    inputSchema: {
      type: 'object',
      properties: { meetupId: { type: 'string' } },
      required: ['meetupId'],
    },
  },
  {
    name: 'create_meetup',
    description: '모임 생성. Scope: meetups_write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        mode: { type: 'string', enum: ['offline', 'online'] },
        startsAt: { type: 'string' },
        capacity: { type: 'number' },
        venueName: { type: 'string' },
        meetingUrl: { type: 'string' },
        requiresApproval: { type: 'boolean' },
        postedAs: { type: 'string', enum: ['real', 'nickname'] },
      },
      required: ['title', 'description', 'mode', 'startsAt', 'capacity'],
    },
  },
  {
    name: 'rsvp_meetup',
    description: '모임 신청/취소. Scope: meetups_write',
    inputSchema: {
      type: 'object',
      properties: {
        meetupId: { type: 'string' },
        action: { type: 'string', enum: ['apply', 'cancel'] },
        note: { type: 'string' },
        postedAs: { type: 'string', enum: ['real', 'nickname'] },
      },
      required: ['meetupId', 'action'],
    },
  },
  {
    name: 'list_products',
    description: '프로덕트 랭킹 (window: today|week|all). Scope: products_read',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: ['today', 'week', 'all'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'read_product',
    description: '프로덕트 상세. Scope: products_read',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'create_product',
    description: '프로덕트 등록. Scope: products_write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        tagline: { type: 'string' },
        description: { type: 'string' },
        websiteUrl: { type: 'string' },
        githubUrl: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'tagline', 'description'],
    },
  },
  {
    name: 'list_toolbox',
    description: '스킬·MCP·CLI 디렉터리 목록. Scope: toolbox_read',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        tag: { type: 'string' },
        q: { type: 'string' },
        sort: {
          type: 'string',
          enum: ['trending', 'rated', 'newest', 'mentions', 'installs'],
        },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'read_toolbox',
    description: '툴박스 항목 상세. Scope: toolbox_read',
    inputSchema: {
      type: 'object',
      properties: { entryId: { type: 'string' } },
      required: ['entryId'],
    },
  },
  {
    name: 'create_toolbox_entry',
    description: '툴박스 항목 추가(canonical URL 중복 병합). Scope: toolbox_write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        oneLiner: { type: 'string' },
        url: { type: 'string' },
        type: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'oneLiner', 'url'],
    },
  },
  {
    name: 'get_install_instructions',
    description: '환경별 설치 스니펫 + 보안 노트. Scope: toolbox_read',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string' },
        environment: {
          type: 'string',
          enum: [
            'claude_code',
            'claude_desktop',
            'cursor',
            'codex_cli',
            'chatgpt',
            'gemini_cli',
            'generic',
          ],
        },
      },
      required: ['entryId'],
    },
  },
  {
    name: 'install_tool',
    description: '설치 지시 반환 + install_count 증가. Scope: toolbox_write',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string' },
        environment: { type: 'string' },
      },
      required: ['entryId'],
    },
  },
]

function publicPostSummary(p: PostWithDetails) {
  return {
    id: p.id,
    title: p.title,
    url: p.url,
    author: publicAuthorLabel(p.author),
    authorKind: p.author.kind,
    postedAs: p.posted_as,
    archiveCount: p.archive_count,
  }
}

async function handleToolsCall(name: string, args: Record<string, unknown> = {}) {
  if (!isDevMode()) {
    return { error: 'Supabase MCP backend is not wired yet.' }
  }

  if (name === 'search_posts') {
    const query = String(args.query || '').toLowerCase()
    const limit = Number(args.limit || 20)
    let posts = await listPosts()
    if (query) {
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.content.toLowerCase().includes(query)
      )
    }
    return { posts: posts.slice(0, limit).map(publicPostSummary) }
  }

  if (name === 'read_post') {
    const post = await getPost(String(args.postId))
    if (!post) return { error: '게시물을 찾을 수 없습니다.' }
    const authorMember = await getPostAuthorMember(post.author_id)
    if (!authorMember) return { error: '작성자를 찾을 수 없습니다.' }
    const pub = toPublicPost(post, authorMember, { archive_count: post.archive_count })
    assertNoIdentityLeak(pub, [authorMember.email])
    return {
      ...pub,
      authorLabel: publicAuthorLabel(pub.author),
      assets: post.assets.map((a) => ({ id: a.id, type: a.type, name: a.name })),
    }
  }

  if (name === 'create_post') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const postedAs = (args.postedAs as 'real' | 'nickname') || 'real'
    const unlock = await getNicknameUnlockState()
    const check = canPostAs(member, postedAs, unlock.unlocked)
    if (!check.ok) return { error: check.reason }

    const url = typeof args.url === 'string' ? args.url : undefined
    const { post: pub } = await createPost(member, {
      title: String(args.title || ''),
      content: String(args.content || ''),
      sourceNote: (args.sourceNote as string) || undefined,
      url,
      postedAs,
      linkPreview: url
        ? {
            url,
            title: null,
            description: null,
            image: null,
            site_name: null,
            favicon: null,
            link_type: detectLinkType(url),
          }
        : undefined,
    })
    return {
      id: pub.id,
      title: pub.title,
      url: pub.url,
      postedAs: pub.posted_as,
      author: publicAuthorLabel(pub.author),
    }
  }

  if (name === 'list_archive') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const items = (await listBrainForOwner(member.id)).slice(0, Number(args.limit || 20))
    return {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        sourceType: i.source_type,
        tags: i.tags,
        reference: `aisubal://archive/${i.id}`,
      })),
    }
  }

  if (name === 'search_archive') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const items = (
      await listBrainForOwner(member.id, {
        q: args.query ? String(args.query) : undefined,
        type: args.type ? (String(args.type) as ArchiveSourceType) : 'all',
        tag: args.tag ? String(args.tag) : undefined,
        collectionId: args.collectionId ? String(args.collectionId) : undefined,
      })
    ).slice(0, Number(args.limit || 20))
    return {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        sourceType: i.source_type,
        summary: i.summary,
        tags: i.tags,
        reference: `aisubal://archive/${i.id}`,
      })),
    }
  }

  if (name === 'get_archive_item') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const item = await getBrainItem(String(args.itemId), member.id)
    if (!item) return { error: '항목을 찾을 수 없습니다.' }
    return {
      id: item.id,
      title: item.title,
      sourceType: item.source_type,
      sourceUrl: item.source_url,
      tags: item.tags,
      note: item.note,
      content: item.content_text,
      extractedText: item.extracted_text,
      llmContext: itemToLlmContext(item),
      reference: `aisubal://archive/${item.id}`,
      useInAi: await buildUseInAi(item.id, member.id),
    }
  }

  if (name === 'list_collections') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const collections = await listCollections(member.id)
    return {
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isShared: c.is_shared,
        itemCount: c.item_count ?? 0,
        reference: `aisubal://collection/${c.id}`,
      })),
    }
  }

  if (name === 'get_collection_context') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const detail = await getCollectionDetail(String(args.collectionId), member.id)
    if (!detail) return { error: '컬렉션을 찾을 수 없습니다.' }
    const pack = await exportCollectionPack(detail.collection.id, member.id)
    if (!pack) return { error: '컬렉션을 찾을 수 없습니다.' }
    const bundle = collectionContextBundle(detail.collection, detail.items)
    return {
      collectionId: detail.collection.id,
      name: detail.collection.name,
      itemCount: bundle.itemCount,
      reference: `aisubal://collection/${detail.collection.id}`,
      context: pack.markdown,
      llmsTxt: pack.llmsTxt,
      skillMd: pack.skillMd,
      prompt: useInAiCollectionPrompt(detail.collection, detail.items),
    }
  }

  if (name === 'save_to_archive') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const postId = args.postId ? String(args.postId) : undefined
    const sourceType = ((args.sourceType as ArchiveSourceType) ||
      (postId ? 'post' : undefined)) as ArchiveSourceType | undefined
    const sourceId = String(args.sourceId || postId || '')
    if (!sourceType || !sourceId) {
      return { error: 'sourceType/sourceId 또는 postId가 필요합니다.' }
    }
    if (sourceType === 'post' || sourceType === 'link') {
      const resolved = await resolveArchiveSource(sourceType, sourceId)
      if (!resolved) return { error: '게시물을 찾을 수 없습니다.' }
      const result = await saveAnything(member, {
        source_type: resolved.source_url ? 'link' : 'post',
        source_id: sourceId,
        title: resolved.title,
        summary: resolved.summary,
        content_text: resolved.content_text,
        source_url: resolved.source_url,
        extracted_text: resolved.extracted_text,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
      })
      return { success: true, id: result.item.id, created: result.created }
    }
    return {
      error: 'MCP save_to_archive는 현재 post/link를 지원합니다. UI/API로 다른 타입도 저장하세요.',
    }
  }

  if (name === 'list_meetups') {
    const tab = String(args.tab || 'upcoming')
    const limit = Number(args.limit || 20)
    const all = await listMeetupsDetailed()
    const filtered =
      tab === 'past'
        ? all.filter((m) => m.status === 'past' || m.status === 'cancelled')
        : all.filter((m) => m.status === 'open' || m.status === 'closed')
    return {
      meetups: filtered.slice(0, limit).map((m) => ({
        id: m.id,
        title: m.title,
        mode: m.mode,
        startsAt: m.starts_at,
        capacity: m.capacity,
        confirmed: m.confirmed_count,
        waitlisted: m.waitlisted_count,
        host: publicAuthorLabel(m.host),
        status: m.status,
      })),
    }
  }

  if (name === 'read_meetup') {
    const meetup = await getMeetupDetails(String(args.meetupId))
    if (!meetup) return { error: '모임을 찾을 수 없습니다.' }
    return {
      id: meetup.id,
      title: meetup.title,
      description: meetup.description,
      mode: meetup.mode,
      startsAt: meetup.starts_at,
      capacity: meetup.capacity,
      confirmed: meetup.confirmed_count,
      requiresApproval: meetup.requires_approval,
      host: publicAuthorLabel(meetup.host),
      venue: meetup.venue_name,
      status: meetup.status,
    }
  }

  if (name === 'create_meetup') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const postedAs = (args.postedAs as 'real' | 'nickname') || 'real'
    const meetup = await createMeetup(member, {
      title: String(args.title || ''),
      description: String(args.description || ''),
      mode: (args.mode as 'offline' | 'online') || 'offline',
      venue_name: (args.venueName as string) || null,
      meeting_url: (args.meetingUrl as string) || null,
      starts_at: String(args.startsAt || ''),
      capacity: Number(args.capacity || 10),
      requires_approval: Boolean(args.requiresApproval),
      posted_as: postedAs,
    })
    return { id: meetup.id, title: meetup.title, mode: meetup.mode, startsAt: meetup.starts_at }
  }

  if (name === 'rsvp_meetup') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const meetupId = String(args.meetupId)
    const action = String(args.action)
    if (action !== 'apply' && action !== 'cancel') {
      return { error: 'action은 apply|cancel' }
    }
    try {
      const result = await handleMeetupRsvp(meetupId, member, {
        action,
        note: (args.note as string) || undefined,
        posted_as: (args.postedAs as 'real' | 'nickname') || 'real',
      })
      if (result.rsvp) {
        return { rsvp: { id: result.rsvp.id, status: result.rsvp.status } }
      }
      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'RSVP 처리 실패' }
    }
  }

  if (name === 'list_products') {
    const window = (args.window as 'today' | 'week' | 'all') || 'all'
    const limit = Number(args.limit || 20)
    const products = await listProductsRanked(window)
    return {
      window,
      products: products.slice(0, limit).map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        upvotes: p.upvote_count,
        tags: p.tags,
      })),
    }
  }

  if (name === 'read_product') {
    const product = await getProductDetails(String(args.productId))
    if (!product) return { error: '프로덕트를 찾을 수 없습니다.' }
    return {
      id: product.id,
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      upvotes: product.upvote_count,
      tags: product.tags,
      makers: product.makers.map(publicAuthorLabel),
      websiteUrl: product.website_url,
      githubUrl: product.github_url,
    }
  }

  if (name === 'create_product') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const product = await createProduct(member, {
      name: String(args.name || ''),
      tagline: String(args.tagline || ''),
      description: String(args.description || ''),
      website_url: (args.websiteUrl as string) || null,
      github_url: (args.githubUrl as string) || null,
      tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
    })
    return { id: product.id, name: product.name, tagline: product.tagline }
  }

  if (name === 'list_toolbox') {
    const entries = await listToolbox({
      type: args.type ? String(args.type) : undefined,
      tag: args.tag ? String(args.tag) : undefined,
      q: args.q ? String(args.q) : undefined,
      sort: (args.sort as ToolboxSort) || 'trending',
    })
    const limit = Number(args.limit || 30)
    return {
      entries: entries.slice(0, limit).map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        type: e.type,
        oneLiner: e.one_liner,
        rating: e.avg_rating,
        mentions: e.mention_count,
        installs: e.install_count,
        url: e.canonical_url,
      })),
    }
  }

  if (name === 'read_toolbox') {
    const entry = await getToolboxEntry(String(args.entryId))
    if (!entry) return { error: '항목을 찾을 수 없습니다.' }
    return {
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      type: entry.type,
      oneLiner: entry.one_liner,
      description: entry.description,
      tags: entry.tags,
      rating: entry.avg_rating,
      mentions: entry.mention_count,
      installs: entry.install_count,
      url: entry.canonical_url,
      license: entry.license,
      lastCommitAt: entry.last_commit_at,
      compat: entry.compat,
    }
  }

  if (name === 'create_toolbox_entry') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const result = await createToolboxEntry(member, {
      name: String(args.name || ''),
      one_liner: String(args.oneLiner || ''),
      canonical_url: String(args.url || ''),
      type: args.type
        ? (String(args.type) as Parameters<typeof createToolboxEntry>[1]['type'])
        : undefined,
      tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
    })
    return {
      id: result.entry.id,
      slug: result.entry.slug,
      created: result.created,
      name: result.entry.name,
    }
  }

  if (name === 'get_install_instructions' || name === 'install_tool') {
    let entry = await getToolboxEntry(String(args.entryId))
    if (!entry) return { error: '항목을 찾을 수 없습니다.' }
    const environment = (String(args.environment || 'cursor') as
      | ToolboxEnvironment
      | 'generic')
    if (name === 'install_tool') {
      entry = await recordToolboxInstall(entry.id)
    }
    const snippet =
      entry.install_snippets[environment] ||
      entry.install_snippets.generic ||
      entry.install_snippets.cursor ||
      `# ${entry.name}\n${entry.canonical_url}`
    return {
      entryId: entry.id,
      slug: entry.slug,
      name: entry.name,
      environment,
      environmentLabel:
        environment === 'generic'
          ? 'Generic'
          : TOOLBOX_ENV_LABEL[environment as ToolboxEnvironment],
      snippet,
      security: {
        sourceRepo: entry.source_repo,
        license: entry.license,
        lastCommitAt: entry.last_commit_at,
        githubUrl: entry.github_url,
        note: '설치 전 소스·라이선스·최근 커밋을 확인하세요.',
      },
      cliHint: `aisubal toolbox install ${entry.slug} --env ${environment}`,
    }
  }

  return { error: `Unknown tool: ${name}` }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ') && !isDevMode()) {
      return NextResponse.json(jsonRpcError(null, -32001, 'Unauthorized'), { status: 401 })
    }

    const body = (await request.json()) as JsonRpcRequest
    const { method, params, id } = body

    if (method === 'initialize') {
      return NextResponse.json(
        jsonRpcSuccess(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'aisubal', version: '0.1.0' },
        })
      )
    }
    if (method === 'tools/list') {
      return NextResponse.json(jsonRpcSuccess(id, { tools: [...TOOLS, ...AGORA_TOOLS] }))
    }
    if (method === 'resources/list') {
      const member = await getMember()
      const resources = []
      if (member) {
        for (const item of (await listBrainForOwner(member.id)).slice(0, 50)) {
          resources.push({
            uri: `aisubal://archive/${item.id}`,
            name: item.title,
            description: item.summary || item.source_type,
            mimeType: 'text/markdown',
          })
        }
        for (const c of await listCollections(member.id)) {
          resources.push({
            uri: `aisubal://collection/${c.id}`,
            name: `Collection: ${c.name}`,
            description: c.description || 'archive collection',
            mimeType: 'text/markdown',
          })
        }
      }
      return NextResponse.json(jsonRpcSuccess(id, { resources }))
    }
    if (method === 'resources/read') {
      const member = await getMember()
      if (!member) {
        return NextResponse.json(jsonRpcError(id, -32001, 'Unauthorized'), { status: 401 })
      }
      const uri = String(params?.uri || '')
      const archiveMatch = uri.match(/^aisubal:\/\/archive\/(.+)$/)
      const collectionMatch = uri.match(/^aisubal:\/\/collection\/(.+)$/)
      if (archiveMatch) {
        const item = await getBrainItem(archiveMatch[1], member.id)
        if (!item) {
          return NextResponse.json(jsonRpcError(id, -32002, 'Not found'))
        }
        return NextResponse.json(
          jsonRpcSuccess(id, {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: itemToLlmContext(item),
              },
            ],
          })
        )
      }
      if (collectionMatch) {
        const pack = await exportCollectionPack(collectionMatch[1], member.id)
        if (!pack) {
          return NextResponse.json(jsonRpcError(id, -32002, 'Not found'))
        }
        return NextResponse.json(
          jsonRpcSuccess(id, {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: pack.markdown,
              },
            ],
          })
        )
      }
      return NextResponse.json(jsonRpcError(id, -32602, 'Unknown resource URI'))
    }
    if (method === 'tools/call') {
      const name = String(params?.name || '')
      const args = (params?.arguments || {}) as Record<string, unknown>
      if (isAgoraTool(name)) {
        // Agent-only space: auth is the bearer token, verified inside the DB RPC.
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
        const anon = createAnonClient()
        const result = await handleAgoraTool(name, args, token, async (fn, rpcArgs) => {
          const { data, error } = await anon.rpc(fn, rpcArgs)
          return { data, error: error ? { message: error.message } : null }
        })
        const isRead = name === 'agora_list' || name === 'agora_get'
        return NextResponse.json(
          jsonRpcSuccess(id, {
            content: [
              ...(isRead && !('error' in result) ? [{ type: 'text', text: UNTRUSTED_NOTICE }] : []),
              { type: 'text', text: JSON.stringify(result, null, 2) },
            ],
            ...('error' in result ? { isError: true } : {}),
          })
        )
      }
      const result = await handleToolsCall(name, args)
      return NextResponse.json(
        jsonRpcSuccess(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      )
    }
    return NextResponse.json(jsonRpcError(id, -32601, `Method not found: ${method}`))
  } catch (error) {
    console.error('MCP error:', error)
    return NextResponse.json(jsonRpcError(null, -32603, 'Internal error'), { status: 500 })
  }
}
