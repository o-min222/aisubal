import Link from 'next/link'
import { ChipBar } from '@/components/chip-bar'
import { redirect } from 'next/navigation'
import { Inbox, Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listTools, socialToolUsers } from '@/lib/data/tools'
import {
  TOOL_CATEGORIES,
  TOOL_SORTS,
  DEFAULT_TOOL_SORT,
  categoryFromLegacyType,
  parseToolSort,
  topTags,
  type ToolCategory,
  type ToolSort,
} from '@/lib/tool-rules'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { PAGE_SIZE } from '@/lib/paging'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { ToolRow } from '@/components/reading/tool-row'
import { loadToolEntry, ToolDetailView } from '@/components/detail/tool-detail-view'
import { ToolSearch } from '@/components/tools/tool-search'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 · AI쓰발') }
}

type Params = { category?: string; type?: string; tag?: string; q?: string; sort?: string; view?: string; mine?: string; page?: string; open?: string }

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
  if (state.type === 'unauthenticated') redirect('/login')
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

  const [all, forTags, openEntry] = await Promise.all([
    listTools(state.member.id, { category, tag, q, sort, rec, mine }),
    listTools(state.member.id, { category }),
    open ? loadToolEntry(open).catch(() => null) : Promise.resolve(null),
  ])
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const tools = all.slice(0, PAGE_SIZE)
  const tags = topTags(forTags, 14)
  const social = await socialToolUsers(state.member.id, tools.map((t) => t.id)).catch(() => new Map())
  const tab = rec ? 'rec' : mine ? 'mine' : category ?? 'all'

  async function more(page: number) {
    'use server'
    const s = await getUserState()
    if (s.type !== 'member') return { nodes: null, hasMore: false }
    const rows = await listTools(s.member.id, { category, tag, q, sort, rec, mine })
    const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const soc = await socialToolUsers(s.member.id, slice.map((t) => t.id)).catch(() => new Map())
    return {
      nodes: slice.length ? (
        <CompactList label={msg('갤러리 목록')}>
          {slice.map((t) => (
            <ToolRow key={t.id} tool={t} href={openHref(here, t.slug)} usage={soc.get(t.id)} />
          ))}
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
            <Plus className="w-4 h-4" /> <T>등록</T>
          </Link>
        </div>
      </header>

      <div className="anon-toolbar space-y-2">
        <ToolSearch key={q} initial={q} />
        <div className="card" style={{ padding: '0 8px' }}>
          <LinkTabs
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
        {tags.length > 0 && (
          <ChipBar label={st('태그')}>
            {tags.map((t) => (
              <Link
                key={t}
                href={hrefWith(base, { tag: tag === t ? null : t })}
                className={`tag-chip ${tag === t ? 'on' : ''}`}
              >
                #{t}
              </Link>
            ))}
          </ChipBar>
        )}
        <div className="flex items-center justify-between gap-2">
          {rec ? (
            <p className="text-[12.5px] text-n-666"><T>내가 쓰는 것과 함께 많이 쓰는 것부터 보여줘요. 이미 쓰는 건 빼요.</T></p>
          ) : (
          <div className="seg" role="tablist" aria-label={st('정렬')}>
            {TOOL_SORTS.map((s) => (
              <Link
                key={s.id}
                href={hrefWith(base, { sort: s.id })}
                role="tab"
                aria-selected={sort === s.id}
                className={sort === s.id ? 'on seg-link' : 'seg-link'}
              >
                <T>{s.label}</T>
              </Link>
            ))}
          </div>
          )}
          <span className="text-xs text-n-888 tabular-nums"><T s="{length}개" vars={{ length: all.length }} /></span>
        </div>
      </div>

      {tools.length === 0 ? (
        <EmptyList
          title={rec ? st('아직 추천할 게 없어요') : mine && !q ? st('아직 ‘나도 써요’로 표시한 게 없어요') : st('조건에 맞는 항목이 없어요')}
          hint={rec ? st('쓰는 것에 ‘나도 써요’를 누르면 비슷한 사람들이 쓰는 걸 추천해 드려요.') : mine && !q ? st('쓰고 있는 항목을 열고 ‘나도 써요’를 누르면 여기에 모여요.') : st('필터를 바꾸거나, 쓰는 걸 갤러리에 등록해 보세요. 내가 만든 서비스도 등록해 홍보할 수 있어요.')}
        />
      ) : (
        <InfiniteList key={here} className="inf-surface" hasMore={totalPages > 1} load={more} storageKey={here}>
          <CompactList label={msg('갤러리 목록')}>
            {tools.map((t) => (
              <ToolRow key={t.id} tool={t} href={openHref(here, t.slug)} active={Boolean(openEntry && openEntry.id === t.id)} usage={social.get(t.id)} />
            ))}
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
