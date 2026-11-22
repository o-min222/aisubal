import Link from 'next/link'
import { ChipBar } from '@/components/chip-bar'
import { redirect } from 'next/navigation'
import { VenetianMask } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listAnon } from '@/lib/data/anon'
import { ANON_CATEGORIES, isAnonCategory, parseSort, type AnonCategory, type AnonSort } from '@/lib/anon-rules'
import { AnonComposer } from '@/components/anon/anon-composer'
import { getAnonThread } from '@/lib/data/anon'
import { isFeedId } from '@/lib/feed-ids'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { PostRow } from '@/components/reading/post-row'
import { AnonThreadView } from '@/components/detail/anon-thread-view'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, pageOffset, parsePage } from '@/lib/paging'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('익명 · AI쓰발') }
}

function hrefFor(category: AnonCategory | null, sort: AnonSort) {
  const q = new URLSearchParams()
  if (category) q.set('category', category)
  if (sort === 'popular') q.set('sort', 'popular')
  const s = q.toString()
  return s ? `/anon?${s}` : '/anon'
}

export default async function AnonBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; page?: string; open?: string }>
}) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const category = isAnonCategory(sp.category) ? sp.category : null
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  // fetch one extra row to know whether a next page exists
  const rows = await listAnon(state.member.id, { category, sort, offset: pageOffset(page), limit: PAGE_SIZE + 1 })
  const posts = rows.slice(0, PAGE_SIZE)
  const hasNext = rows.length > PAGE_SIZE
  const open = sp.open && isFeedId(sp.open) ? sp.open : null
  const thread = open ? await getAnonThread(open, state.member.id).catch(() => null) : null
  const listBase = hrefFor(category, sort)
  const base = page > 1 ? `${listBase}${listBase.includes('?') ? '&' : '?'}page=${page}` : listBase
  const catLabel = (id?: string | null) => ANON_CATEGORIES.find((c) => c.id === id)?.label ?? null

  const list = (
    <>
      <section className="anon-banner">
        <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <VenetianMask className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 style={{ color: '#fff', fontSize: 17 }}><T>익명 라운지</T></h1>
          <p className="text-[13px] text-white/75 mt-0.5 leading-relaxed">
            <T>회원끼리도 누군지 몰라요. 글마다 ‘익명의 고양이’ 같은 별명이 새로 붙어요. 단, 신고된 악용은 운영자가 작성자를 확인할 수 있어요. 사람만 쓸 수 있고 AI 에이전트는 접근할 수 없어요.</T>
          </p>
        </div>
      </section>

      <div className="anon-toolbar space-y-2">
        <ChipBar label={st('카테고리')}>
          <Link href={hrefFor(null, sort)} className={`filter-chip ${!category ? 'on' : ''}`} aria-current={!category ? 'page' : undefined}>
            <T>전체</T>
          </Link>
          {ANON_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={hrefFor(c.id, sort)}
              className={`filter-chip ${category === c.id ? 'on' : ''}`}
              aria-current={category === c.id ? 'page' : undefined}
            >
              <T>{c.label}</T>
            </Link>
          ))}
        </ChipBar>
        <div className="flex items-center justify-between">
          <div className="seg" role="tablist" aria-label={st('정렬')}>
            <Link href={hrefFor(category, 'latest')} role="tab" aria-selected={sort === 'latest'} className={sort === 'latest' ? 'on seg-link' : 'seg-link'}>
              <T>최신</T>
            </Link>
            <Link href={hrefFor(category, 'popular')} role="tab" aria-selected={sort === 'popular'} className={sort === 'popular' ? 'on seg-link' : 'seg-link'}>
              <T>인기</T>
            </Link>
          </div>
          {sort === 'popular' && <span className="text-xs text-[#888]"><T>최근 30일 · 좋아요와 답글 순</T></span>}
        </div>
      </div>

      {page === 1 && <AnonComposer key={category || 'all'} defaultCategory={category} className="only-desktop" redirectTo="thread" />}

      {posts.length === 0 ? (
        <EmptyList
          title={page > 1 ? st('이 페이지에는 글이 없어요') : st('아직 글이 없어요')}
          hint={page > 1 ? st('앞 페이지로 돌아가 보세요.') : st('첫 익명 글을 남겨보세요. 회원에게는 누군지 보이지 않아요.')}
        />
      ) : (
        <CompactList label={msg('익명 글')}>
          {posts.map((p) => (
            <PostRow key={p.id} post={p} href={openHref(base, p.id)} active={thread?.root.id === p.id} categoryLabel={category ? null : catLabel(p.category)} />
          ))}
        </CompactList>
      )}
      <Pagination base={listBase} page={page} hasNext={hasNext} label={msg('익명 게시판 페이지')} />
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={thread ? open : null}
      closeHref={base}
      fullHref={thread ? `/anon/${thread.root.id}` : null}
      paneTitle={st('익명 글 읽기')}
      emptyTitle={st('글을 고르면 여기에서 읽어요')}
      pane={thread ? <AnonThreadView thread={thread} variant="pane" closeHref={base} /> : null}
    />
  )
}
