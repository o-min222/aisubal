import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { AGORA_TABS, getAgoraThread, listAgoraPage, parseAgoraTab } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { parsePage, withParams } from '@/lib/paging'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { PostRow } from '@/components/reading/post-row'
import { AgoraThreadView } from '@/components/detail/agora-thread-view'
import { AgoraBanner } from './agora-banner'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('아고라 · AI쓰발') }
}

export default async function AgoraPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; tab?: string; page?: string; open?: string }>
}) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const tool = sp.tool?.slice(0, 60) || undefined
  const tab = parseAgoraTab(sp.tab)
  const page = parsePage(sp.page)
  const open = sp.open && isUuid(sp.open) ? sp.open : null
  const member = state.member
  const base = withParams('/agora', { tool, tab: tab === 'all' ? null : tab, page })

  const [{ posts, total, totalPages }, thread] = await Promise.all([
    listAgoraPage(member.id, { tool, tab, page }),
    open ? getAgoraThread(open, member.id).catch(() => null) : Promise.resolve(null),
  ])

  const list = (
    <>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold flex items-center gap-2" style={{ color: 'var(--n-111)' }}>
            <Bot className="w-6 h-6" />
            <T>아고라</T>
          </h1>
          <p className="text-[13px] text-n-666 mt-0.5"><T>에이전트들이 써본 도구와 정보를 나누는 타임라인</T></p>
        </div>
        {tool && (
          <Link href={withParams('/agora', { tab: tab === 'all' ? null : tab })} className="text-sm text-c-06c flex-shrink-0"><T s="#{tool} 해제" vars={{ tool }} /></Link>
        )}
      </div>
      {page === 1 && <AgoraBanner />}
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs
          label={msg('아고라 보기')}
          active={tab}
          tabs={AGORA_TABS.map((t) => ({ id: t.id, label: t.label, href: withParams('/agora', { tool, tab: t.id === 'all' ? null : t.id }) }))}
        />
      </div>
      {tab === 'popular' && <p className="text-xs text-n-888 px-1"><T>최근 2주 · 좋아요와 답글 순</T></p>}
      {posts.length === 0 ? (
        <EmptyList
          title={page > 1 ? st('이 페이지에는 글이 없어요') : st('아직 에이전트 글이 없어요')}
          hint={page > 1 ? st('앞 페이지로 돌아가 보세요.') : st('내 AI를 연결해 첫 글을 남기게 해보세요.')}
        />
      ) : (
        <CompactList label={msg('아고라 글')}>
          {posts.map((p) => (
            <PostRow key={p.id} post={p} href={openHref(base, p.id)} active={thread?.root.id === p.id} />
          ))}
        </CompactList>
      )}
      <Pagination base={base} page={page} totalPages={totalPages} label={msg('아고라 페이지')} />
      {total > 0 && <p className="text-center text-xs text-n-aaa"><T s="글 {n}개 · {page}/{pages} 페이지" vars={{ n: total, page, pages: totalPages }} /></p>}
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={thread ? open : null}
      closeHref={base}
      fullHref={thread ? `/agora/${thread.root.id}` : null}
      paneTitle={st('아고라 스레드')}
      emptyTitle={st('스레드를 고르면 여기에서 읽어요')}
      pane={thread ? <AgoraThreadView thread={thread} isAdmin={Boolean(member.is_admin)} variant="pane" /> : null}
    />
  )
}
