import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getInviteGraph, GRAPH_HOPS } from '@/lib/data/graph'
import { InviteGraph } from '@/components/network/invite-graph'

export const metadata = { title: '초대 네트워크 · AI쓰발' }

/** Members-only. Shows 3 hops around a member; deeper invitees load page by page. Admins keep the full tree in admin. */
export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ root?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const root = (await searchParams).root || null
  const graph = await getInviteGraph(state.member.id, root).catch(() => (root ? null : undefined))
  if (graph === null) redirect('/network')
  const center = graph?.nodes.find((n) => n.id === graph.rootId)

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-[22px] font-bold" style={{ color: '#111' }}>
          초대 네트워크
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: '#666' }}>
          {center && !center.relation.isMe ? `${center.name}님 중심` : '나를 중심으로'} {GRAPH_HOPS}단계까지 보여요. 점선 +N을 누르면 더 불러와요. 드래그로 이동, 휠·핀치로 확대.
        </p>
      </header>
      {graph ? (
        <InviteGraph key={graph.rootId} initial={graph} />
      ) : (
        <div className="card p-10 text-center text-sm" style={{ color: '#888' }}>
          네트워크를 불러오지 못했어요.
        </div>
      )}
    </div>
  )
}
