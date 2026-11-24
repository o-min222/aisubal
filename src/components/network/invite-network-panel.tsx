'use client'

import { useEffect, useState } from 'react'
import type { GraphPayload } from '@/lib/data/graph'
import { InviteGraph } from '@/components/network/invite-graph'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/** A70: the invite network inside 친구·팔로워, loaded when its tab opens (?root= re-centres it). */
export function InviteNetworkPanel({ root, hops }: { root: string | null; hops: number }) {
  const [state, setState] = useState<{ root: string | null; graph: GraphPayload | null; failed: boolean } | null>(null)
  useEffect(() => {
    let live = true
    fetch(root ? `/api/network?root=${encodeURIComponent(root)}` : '/api/network')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((g: GraphPayload) => live && setState({ root, graph: g, failed: false }))
      .catch(() => live && setState({ root, graph: null, failed: true }))
    return () => {
      live = false
    }
  }, [root])
  const ready = state && state.root === root ? state : null
  const center = ready?.graph?.nodes.find((n) => n.id === ready.graph!.rootId)
  return (
    <div className="invite-network">
      <p className="sm-hint">
        <T
          s="{v} {GRAPH_HOPS}단계까지 보여요. 점선 +N을 누르면 더 불러와요. 드래그로 이동, 휠·핀치로 확대."
          vars={{ v: center && !center.relation.isMe ? tx('{name}님 중심', { name: center.name }) : tx('나를 중심으로'), GRAPH_HOPS: hops }}
        />
      </p>
      {!ready ? (
        <div className="invite-graph-loading" aria-busy="true" aria-label={tx('불러오는 중')} />
      ) : ready.graph ? (
        <InviteGraph key={ready.graph.rootId} initial={ready.graph} />
      ) : (
        <p className="sm-empty">
          <T>네트워크를 불러오지 못했어요.</T>
        </p>
      )}
    </div>
  )
}
