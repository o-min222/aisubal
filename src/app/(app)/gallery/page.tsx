import Link from 'next/link'
import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import { Inbox, Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listTools, socialCircle, socialToolUsers } from '@/lib/data/tools'
import {
  TOOL_CATEGORIES,
  TOOL_SORTS,
  DEFAULT_TOOL_SORT,
  categoryFromLegacyType,
  parseToolSort,
  topTags,
  type ToolCategory,
  type ToolListItem,
  type ToolSort,
} from '@/lib/tool-rules'
import type { ToolUsageStack } from '@/lib/tool-usage-rules'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { PAGE_SIZE } from '@/lib/paging'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { GalleryGroupHeader, GalleryRow } from '@/components/tools/gallery-row'
import { groupHeaderAt } from '@/lib/gallery-rows'
import { loadToolEntry, ToolDetailView } from '@/components/detail/tool-detail-view'
import { ToolSearch } from '@/components/tools/tool-search'
import { GallerySort } from '@/components/tools/gallery-sort'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 · AI쓰발') }
}

type Params = { category?: string; type?: string; tag?: string; q?: string; sort?: string; view?: string; mine?: string; page?: string; open?: string }

type RowCtx = { here: string; sort: ToolSort; ranked: boolean; grouped: boolean; openId?: string | null }

/** A84: one page of Product Hunt-style rows; ranks and date groups continue across pages */
function galleryRows(slice: ToolListItem[], offset: number, prev: ToolListItem | null, social: Map<string, ToolUsageStack>, c: RowCtx) {
  const created = slice.map((t) => t.created_at)
  return slice.map((t, i) => {
    const bucket = c.grouped ? groupHeaderAt(created, i, prev?.created_at ?? null) : null
    return (
      <Fragment key={t.id}>
        {bucket && <GalleryGroupHeader bucket={bucket} />}
        <GalleryRow tool={t} href={openHref(c.here, t.slug)} active={c.openId === t.id} usage={social.get(t.id)} rank={c.ranked ? offset + i + 1 : null} sort={c.sort} />
      </Fragment>
    )
  })
}

function hrefWith(base: Params, patch: Partial<Record<keyof Params, string | null>>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) next[k] = v
  delete next.type
  delete next.mine
  delete next.open
  if (next.page === '1') delete next.page
  if (next.sort === DEFAULT_TOOL_SORT) delete next.sort
  const s = new URLSearchParams(next).toString()
  return s ? `/gallery?${s}` : '/gallery'
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')

  const sp = await searchParams
  const category: ToolCategory | null = categoryFromLegacyType(sp.category || sp.type)
  const sort: ToolSort = parseToolSort(sp.sort)
  const rec = sp.view === 'rec'
  const mine = !rec && (sp.view === 'mine' || sp.mine === '1')
  const tag = sp.tag?.toLowerCase() || null
  const q = sp.q || ''
  const base: Params = { category: category ?? undefined, tag: tag ?? undefined, q: q || undefined, sort, view: rec ? 'rec' : mine ? 'mine' : undefined }
  // Old links (?category=launch|rules|prompt, ?type=…, ?mine=1) land on today's URL (?mine=1 → 내가 쓰는 것).
  if ((sp.category && sp.category !== category) || sp.type || sp.mine) {
    const to = new URL(hrefWith(base, {}), 'http://x')
    if (sp.open) to.searchParams.set('open', sp.open)
    redirect(to.pathname + to.search)
  }
  const here = hrefWith(base, {})
  const open = sp.open ? decodeURIComponent(sp.open).slice(0, 120) : null

  // A67: who-uses stacks need my friends/follows; fetch them alongside the lists instead of after
  const circle = socialCircle(state.member.id)
  const [all, forTags, openEntry] = await Promise.all([
    listTools(state.member.id, { category, tag, q, sort, rec, mine }),
    listTools(state.member.id, { category }),
    open ? loadToolEntry(open).catch(() => null) : Promise.resolve(null),
  ])
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const tools = all.slice(0, PAGE_SIZE)
  const tags = topTags(forTags, 14)
  const social = await socialToolUsers(state.member.id, tools.map((t) => t.id), circle).catch(() => new Map())
  const tab = rec ? 'rec' : mine ? 'mine' : category ?? 'all'

  const rowCtx: RowCtx = { here, sort, ranked: !rec && sort === 'popular', grouped: !rec && sort === 'newest' }

  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const rows = await listTools(s.member.id, { category, tag, q, sort, rec, mine })
    const from = (page - 1) * PAGE_SIZE
    const slice = rows.slice(from, page * PAGE_SIZE)
    const soc = await socialToolUsers(s.member.id, slice.map((t) => t.id)).catch(() => new Map())
    return {
      nodes: slice.length ? (
        <CompactList label={msg('갤러리 목록')}>
          {galleryRows(slice, from, rows[from - 1] ?? null, soc, rowCtx)}
        </CompactList>
      ) : null,
      hasMore: page * PAGE_SIZE < rows.length,
    }
  }

  const list = (
    <>
      <header className="tools-head">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-n-111"><T>갤러리</T></h1>
          <p className="text-[13px] text-n-666 mt-0.5"><T>MCP·스킬·CLI·서비스. 멤버가 쓰는 것과 직접 만든 서비스를 한곳에서.</T></p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/gallery/submissions" className="btn btn-secondary btn-sm min-h-[40px]" aria-label={st('내가 올린 항목')}>
            <Inbox className="w-4 h-4" /> <span className="only-desktop"><T>내 요청</T></span>
          </Link>
          <Link href="/gallery/new" className="btn btn-primary btn-sm min-h-[40px]">
            <Plus className="w-4 h-4" /> <T>올리기</T>
          </Link>
        </div>
      </header>

      {/* A83–A85: one sticky block on phones — search (tags live in its suggestions) + the category tab row (categories only) */}
      <div className="sticky-sub gallery-controls">
        <ToolSearch key={`${q}|${tag ?? ''}`} initial={q} tags={tags} activeTag={tag} />
        <div className="gallery-bar">
          <LinkTabs
            flush
            className="gallery-tabs"
            label={msg('카테고리')}
            active={tab}
            tabs={[
              { id: 'all', label: st('전체'), href: hrefWith(base, { category: null, view: null, tag: null }) },
              { id: 'rec', label: st('추천'), href: hrefWith(base, { category: null, view: 'rec', tag: null }) },
              { id: 'mine', label: st('내가 쓰는 것'), href: hrefWith(base, { category: null, view: 'mine', tag: null }) },
              ...TOOL_CATEGORIES.map((c) => ({ id: c.id, label: st(c.label), href: hrefWith(base, { category: c.id, view: null, tag: null }) })),
            ]}
          />
        </div>
      </div>
      {/* A85: list header — count on the left, the sort control on the right (scrolls with the list) */}
      <div className="gallery-listhead">
        {rec ? (
          <p className="gallery-meta"><T>내가 쓰는 것과 함께 많이 쓰는 것부터 보여줘요. 이미 쓰는 건 빼요.</T></p>
        ) : (
          <>
            <p className="gallery-meta tabular-nums"><T s="{length}개" vars={{ length: all.length }} /></p>
            <GallerySort active={sort} items={TOOL_SORTS.map((s) => ({ id: s.id, label: s.label, href: hrefWith(base, { sort: s.id }) }))} />
          </>
        )}
      </div>

      {tools.length === 0 ? (
        <EmptyList
          title={rec ? st('아직 추천할 게 없어요') : mine && !q ? st('아직 ‘나도 써요’로 표시한 게 없어요') : st('조건에 맞는 항목이 없어요')}
          hint={rec ? st('쓰는 것에 ‘나도 써요’를 누르면 비슷한 사람들이 쓰는 걸 추천해 드려요.') : mine && !q ? st('쓰고 있는 항목을 열고 ‘나도 써요’를 누르면 여기에 모여요.') : st('필터를 바꾸거나, 쓰는 걸 갤러리에 등록해 보세요. 내가 만든 서비스도 등록해 홍보할 수 있어요.')}
        />
      ) : (
        <InfiniteList key={here} className="inf-surface" hasMore={totalPages > 1} load={more} storageKey={here}>
          <CompactList label={msg('갤러리 목록')}>
            {galleryRows(tools, 0, null, social, { ...rowCtx, openId: openEntry?.id ?? null })}
          </CompactList>
        </InfiniteList>
      )}
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={openEntry ? open : null}
      closeHref={here}
      fullHref={openEntry ? `/gallery/${openEntry.slug}` : null}
      paneTitle={openEntry ? openEntry.name : st('갤러리')}
      emptyTitle={st('항목을 고르면 여기에서 자세히 봐요')}
      pane={openEntry ? <ToolDetailView entry={openEntry} member={state.member} variant="pane" /> : null}
    />
  )
}
