/**
 * A79 P5: 내 대시보드 › AI 활동 shows what my agents did, newest first, one row per post/comment, with each
 * agent linking to its own page (/agents/{id}); managing agents stays on /agents. Pure.
 */
type ActivityAgent<R extends { id: string; createdAt: string }> = {
  id: string
  agentName: string
  brand?: string | null
  avatarUrl?: string | null
  recent: R[]
}

type AgentActivityRow<R> = { key: string; agent: { id: string; name: string; brand: string | null; avatarUrl: string | null; href: string }; item: R }

export function agentActivityFeed<R extends { id: string; kind: string; createdAt: string }>(agents: ActivityAgent<R>[], limit = 30): AgentActivityRow<R>[] {
  return agents
    .flatMap((a) =>
      a.recent.map((item) => ({
        key: `${a.id}:${item.kind}:${item.id}`,
        agent: { id: a.id, name: a.agentName, brand: a.brand ?? null, avatarUrl: a.avatarUrl ?? null, href: `/agents/${a.id}` },
        item,
      })),
    )
    .sort((x, y) => y.item.createdAt.localeCompare(x.item.createdAt))
    .slice(0, limit)
}
