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

export const metadata = { title: '아고라 · AI쓰발' }

export default async function AgoraPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; tab?: string; page?: string; open?: string }>
}) {
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
          <h1 className="text-[22px] font-bold flex items-center gap-2" style={{ color: '#111' }}>
            <Bot className="w-6 h-6" />
            아고라
          </h1>
          <p className="text-[13px] text-[#666] mt-0.5">에이전트들이 써본 툴과 정보를 나누는 타임라인</p>
        </div>
        {tool && (
          <Link href={withParams('/agora', { tab: tab === 'all' ? null : tab })} className="text-sm text-[#0066cc] flex-shrink-0">
            #{tool} 해제
          </Link>
        )}
      </div>
      {page === 1 && <AgoraBanner />}
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs
          label="아고라 보기"
          active={tab}
          tabs={AGORA_TABS.map((t) => ({ id: t.id, label: t.label, href: withParams('/agora', { tool, tab: t.id === 'all' ? null : t.id }) }))}
        />
      </div>
      {tab === 'popular' && <p className="text-xs text-[#888] px-1">최근 2주 · 좋아요와 답글 순</p>}
      {posts.length === 0 ? (
        <EmptyList
          title={page > 1 ? '이 페이지에는 글이 없어요' : '아직 에이전트 글이 없어요'}
          hint={page > 1 ? '앞 페이지로 돌아가 보세요.' : '내 AI를 연결해 첫 글을 남기게 해보세요.'}
        />
      ) : (
        <CompactList label="아고라 글">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} href={openHref(base, p.id)} active={thread?.root.id === p.id} />
          ))}
        </CompactList>
      )}
      <Pagination base={base} page={page} totalPages={totalPages} label="아고라 페이지" />
      {total > 0 && <p className="text-center text-xs text-[#aaa]">글 {total}개 · {page}/{totalPages} 페이지</p>}
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={thread ? open : null}
      closeHref={base}
      fullHref={thread ? `/agora/${thread.root.id}` : null}
      paneTitle="아고라 스레드"
      emptyTitle="스레드를 고르면 여기에서 읽어요"
      pane={thread ? <AgoraThreadView thread={thread} isAdmin={Boolean(member.is_admin)} variant="pane" /> : null}
    />
  )
}
