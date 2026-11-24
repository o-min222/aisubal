/** A66: the dev-server (DEV_BYPASS_AUTH) mock path for tools that production runs through token-verified RPCs. */
import { installAnswer } from '@/lib/install-catalog'
import { getMember } from '@/lib/auth'
import { listPosts, getPost, getProductDetails, createProduct, getToolboxEntry, recordToolboxInstall } from '@/lib/data'
import type { PostWithDetails } from '@/lib/data/types'
import { publicAuthorLabel, toPublicPostView, assertNoIdentityLeak } from '@/lib/profile'
import { TOOLBOX_ENV_LABEL } from '@/lib/toolbox-rules'
import type { ToolboxEnvironment } from '@/lib/supabase/types'
import { APP_ORIGIN, shapeMyMeetups, suggestMeetupActions } from '@/lib/moim-calendar'
import { mockMine } from '@/lib/data/moim-calendar'
import { HUMAN_UNTRUSTED_NOTICE, groupForAgent, moimForAgent } from '@/lib/mcp-data'
import { getMoim, listMoim, type Moim, type MoimDetail } from '@/lib/data/moim'
import { getGroupBySlug, listMyGroups } from '@/lib/data/groups'
import { getMockLaunchEntry, getToolUsers, listTools, setToolUsage, toolSlugForProduct } from '@/lib/data/tools'
import { categoryFromLegacyType, parseToolSort } from '@/lib/tool-rules'
import { mockMySubmissions, mockReviewDecide, mockReviewGet, mockReviewQueue, mockSubmitTool } from '@/lib/data/tool-submissions'
import { REFUSED_TOOLS } from './registry'

/** handler cases served by the tool-submission mocks */
const SUBMIT_REVIEW_CASES = new Set(['submit_tool', 'my_tool_submissions', 'review_queue_list', 'review_get', 'review_approve', 'review_edit', 'review_reject'])


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

export async function handleDevTool(name: string, args: Record<string, unknown> = {}) {
  // DEV mock path only — production calls go through handleDataTool (lib/mcp-data.ts).
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
    const pub = toPublicPostView(post, { archive_count: post.archive_count })
    assertNoIdentityLeak(pub, post.posted_as === 'nickname' && post.author_id ? [post.author_id] : [])
    return {
      ...pub,
      authorLabel: publicAuthorLabel(pub.author),
      assets: post.assets.map((a) => ({ id: a.id, type: a.type, name: a.name })),
    }
  }

  if (name === 'create_post') {
    return {
      error:
        'Agents cannot create posts in the human feed. Use agora_post for the AI Agora, or feed_comment on posts whose author allows agents.',
    }
  }

  // ---- 모임 / 그룹 (DEV mock; mirrors lib/mcp-data.ts — read-only for agents)
  if (name === 'list_meetups' || name === 'read_meetup' || name === 'my_groups') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    if (name === 'my_groups') {
      const groups = await listMyGroups(member.id)
      return {
        notice: HUMAN_UNTRUSTED_NOTICE,
        groups: groups.map((g) => groupForAgent({ ...g, role: g.myRole })),
      }
    }
    const toAgent = (m: Moim | MoimDetail) => ({
      ...m,
      host: m.host.name,
      group: m.group ? { slug: m.group.slug, name: m.group.name } : null,
      myStatus: m.myRsvp?.status ?? null,
      questions: m.questions.map((q) => q.label),
    })
    if (name === 'read_meetup') {
      const m = await getMoim(member.id, String(args.meetupId || ''))
      if (!m) return { error: 'Not found.' }
      return { notice: HUMAN_UNTRUSTED_NOTICE, meetup: moimForAgent(toAgent(m), true) }
    }
    const tab = args.tab === 'past' || args.tab === 'mine' ? args.tab : 'upcoming'
    let groupId: string | null = null
    if (args.group) {
      const g = await getGroupBySlug(member.id, String(args.group))
      if (!g) return { notice: HUMAN_UNTRUSTED_NOTICE, tab, meetups: [] }
      groupId = g.id
    }
    const list = await listMoim(member.id, tab, groupId, Math.min(Number(args.limit) || 20, 50))
    return { notice: HUMAN_UNTRUSTED_NOTICE, tab, meetups: list.map((m) => moimForAgent(toAgent(m))) }
  }
  if (name === 'my_meetups') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const raw = await mockMine(member.id)
    return { notice: HUMAN_UNTRUSTED_NOTICE, ...shapeMyMeetups(raw, APP_ORIGIN), suggestedActions: suggestMeetupActions(raw) }
  }
  if (name in REFUSED_TOOLS) {
    return { error: REFUSED_TOOLS[name], refused: true, humanOnly: true }
  }

  // ---- 툴 (DEV mock; mirrors the gallery_* cases in lib/mcp-data.ts)
  if (name === 'list_tools') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const sort = String(args.sort || 'popular')
    const tools = await listTools(member.id, {
      category: categoryFromLegacyType(args.category ? String(args.category) : null),
      tag: args.tag ? String(args.tag) : null,
      q: args.q ? String(args.q) : null,
      sort: parseToolSort(sort === 'upvotes' || sort === 'users' || sort === 'rated' ? 'popular' : sort),
      mine: args.mine === true,
    })
    const ordered =
      sort === 'upvotes' ? [...tools].sort((x, y) => (y.upvote_count ?? 0) - (x.upvote_count ?? 0)) : tools
    return {
      category: args.category ?? 'all',
      sort,
      tools: ordered.slice(0, Number(args.limit || 30)).map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        type: e.type,
        oneLiner: e.one_liner,
        tags: e.tags,
        rating: e.avg_rating,
        aiRating: e.ai_rating_avg,
        userCount: e.user_count ?? 0,
        upvotes: e.product_id ? e.upvote_count : undefined,
        productId: e.product_id ?? null,
        usedByMe: e.used_by_me,
        page: `/gallery/${e.slug}`,
      })),
    }
  }

  if (name === 'read_tool') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const key = String(args.entryId || '')
    const bySlug = (await getToolboxEntry(key)) ?? (await getMockLaunchEntry(key))
    const slugFromProduct = bySlug ? null : await toolSlugForProduct(key)
    const entry = bySlug ?? (slugFromProduct ? await getMockLaunchEntry(slugFromProduct) : null)
    if (!entry) return { error: '갤러리 항목을 찾을 수 없습니다.' }
    const [users, launch] = await Promise.all([
      getToolUsers(entry.id, member.id),
      entry.product_id ? getProductDetails(entry.product_id, member.id) : Promise.resolve(null),
    ])
    return {
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      type: entry.type,
      oneLiner: entry.one_liner,
      description: entry.description,
      tags: entry.tags,
      rating: entry.avg_rating,
      userCount: users.count,
      usedByMe: users.usedByMe,
      users: users.users.map((u) => u.name),
      launch: launch
        ? { productId: launch.id, tagline: launch.tagline, upvotes: launch.upvote_count, makers: launch.makers.map(publicAuthorLabel) }
        : null,
      page: `/gallery/${entry.slug}`,
    }
  }

  if (name === 'set_tool_usage') {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const key = String(args.entryId || '')
    const entry = (await getToolboxEntry(key)) ?? (await getMockLaunchEntry(key))
    if (!entry) return { error: '갤러리 항목을 찾을 수 없습니다.' }
    const using = args.using === undefined ? true : args.using === true
    const userCount = await setToolUsage(entry.id, member.id, using)
    return { entryId: entry.id, using, userCount }
  }

  if (name === 'launch_product') {
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
    const slug = await toolSlugForProduct(product.id)
    return { productId: product.id, slug, name: product.name, tagline: product.tagline, url: slug ? `/gallery/${slug}` : null }
  }

  // DEV mock: agent-only submissions + admin review queue (production: lib/mcp-data.ts → 0013 RPCs)
  if (SUBMIT_REVIEW_CASES.has(name)) {
    const member = await getMember()
    if (!member) return { error: 'Unauthorized' }
    const label = `${member.display_name}님의 개발용 에이전트`
    if (name === 'submit_tool') {
      if (!args.name || !args.oneLiner || !args.url) return { error: 'name, oneLiner, url required' }
      if (args.type === 'product') return { error: '직접 만든 프로덕트는 gallery_launch로 등록하세요.' }
      return mockSubmitTool(member.id, label, args)
    }
    if (name === 'my_tool_submissions') return mockMySubmissions(member.id)
    if (!member.is_admin) return { error: 'tools:review is admin-only, and this token owner is not an admin (any more).' }
    if (name === 'review_queue_list') return mockReviewQueue(String(args.status || 'pending'))
    if (name === 'review_get') return mockReviewGet(String(args.submissionId))
    const action = name === 'review_approve' ? 'approve' : name === 'review_edit' ? 'edit' : 'reject'
    const edits = args.edits && typeof args.edits === 'object' ? (args.edits as Record<string, unknown>) : null
    return mockReviewDecide(String(args.submissionId), action, label, edits, (action === 'reject' ? args.reason : args.note) ? String(action === 'reject' ? args.reason : args.note) : null)
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
    const ans = installAnswer(entry, environment)
    const snippet = ans.snippet ?? ans.note!
    return {
      entryId: entry.id,
      slug: entry.slug,
      name: entry.name,
      verified: ans.verified,
      officialUrl: ans.officialUrl,
      environment: ans.environment,
      environmentLabel:
        ans.environment === 'generic'
          ? 'Generic'
          : TOOLBOX_ENV_LABEL[ans.environment as ToolboxEnvironment],
      snippet,
      security: {
        sourceRepo: entry.source_repo,
        license: entry.license,
        lastCommitAt: entry.last_commit_at,
        githubUrl: entry.github_url,
        note: '설치 전 소스·라이선스·최근 커밋을 확인하세요.',
      },
      cliHint: `aisubal tools install ${entry.slug} --env ${environment}`,
    }
  }

  return { error: `Unknown tool: ${name}` }
}

