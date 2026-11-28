/**
 * Radial layout for the invite graph. Pure so it can be unit-tested.
 * - The center member sits at (0,0); invitees fan out by depth.
 * - Ancestors (negative depth) stack straight up, so descendants use a
 *   downward 270° fan when ancestors exist and the full circle otherwise.
 * - A node whose loaded children are fewer than its child_count gets a
 *   "+N" placeholder child that loads the next page when tapped.
 */
type LayoutInput = { id: string; parentId: string | null; depth: number | null; childCount: number }
type Placed = { id: string; x: number; y: number; depth: number; more?: { parentId: string; remaining: number; offset: number } }
export type Edge = { from: string; to: string }

const RING = 150
const MIN_ARC = 52

export function layoutGraph(nodes: LayoutInput[], rootId: string): { placed: Placed[]; edges: Edge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = new Map<string, LayoutInput[]>()
  for (const n of nodes) {
    if (n.id === rootId || n.depth == null || n.depth < 0 || !n.parentId || !byId.has(n.parentId)) continue
    const arr = kids.get(n.parentId) || []
    arr.push(n)
    kids.set(n.parentId, arr)
  }
  const placed: Placed[] = []
  const edges: Edge[] = []
  const root = byId.get(rootId)
  if (!root) return { placed, edges }

  // ancestors straight up
  const ancestors = nodes.filter((n) => n.depth != null && n.depth < 0).sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
  let prev = rootId
  for (const a of ancestors) {
    placed.push({ id: a.id, x: 0, y: (a.depth ?? -1) * RING * 0.8, depth: a.depth ?? -1 })
    edges.push({ from: a.id, to: prev })
    prev = a.id
  }

  const remaining = (n: LayoutInput) => Math.max(0, n.childCount - (kids.get(n.id)?.length ?? 0))
  const leafMemo = new Map<string, number>()
  const leaves = (id: string): number => {
    if (leafMemo.has(id)) return leafMemo.get(id)!
    const n = byId.get(id)!
    const c = kids.get(id) || []
    const v = Math.max(1, c.reduce((s, k) => s + leaves(k.id), 0) + (remaining(n) > 0 ? 1 : 0))
    leafMemo.set(id, v)
    return v
  }
  let maxDepth = 1
  const walkDepth = (id: string, d: number) => {
    maxDepth = Math.max(maxDepth, d + (remaining(byId.get(id)!) > 0 ? 1 : 0))
    for (const k of kids.get(id) || []) walkDepth(k.id, d + 1)
  }
  walkDepth(rootId, 0)

  const span = ancestors.length ? Math.PI * 1.5 : Math.PI * 2
  const start = ancestors.length ? -span / 2 : -Math.PI
  // grow the rings when the outermost ring would be too crowded
  const total = leaves(rootId)
  const scale = Math.max(1, (total * MIN_ARC) / (span * RING * maxDepth))
  const radius = (d: number) => d * RING * scale

  const pos = (d: number, a: number) => ({ x: radius(d) * Math.sin(a), y: radius(d) * Math.cos(a) })
  placed.push({ id: rootId, x: 0, y: 0, depth: 0 })

  const place = (id: string, d: number, a0: number, a1: number) => {
    const n = byId.get(id)!
    const c = (kids.get(id) || []).slice()
    const units = leaves(id)
    let a = a0
    for (const k of c) {
      const w = ((a1 - a0) * leaves(k.id)) / units
      const mid = a + w / 2
      placed.push({ id: k.id, ...pos(d + 1, mid), depth: d + 1 })
      edges.push({ from: id, to: k.id })
      place(k.id, d + 1, a, a + w)
      a += w
    }
    const rem = remaining(n)
    if (rem > 0) {
      const w = (a1 - a0) / units
      const moreId = `more:${id}`
      placed.push({ id: moreId, ...pos(d + 1, a + w / 2), depth: d + 1, more: { parentId: id, remaining: rem, offset: c.length } })
      edges.push({ from: id, to: moreId })
    }
  }
  place(rootId, 0, start, start + span)
  // Round so server and browser trig results serialize identically (no hydration mismatch).
  const r2 = (n: number) => Math.round(n * 100) / 100
  return { placed: placed.map((p) => ({ ...p, x: r2(p.x), y: r2(p.y) })), edges }
}

export function bounds(placed: Array<{ x: number; y: number }>, pad = 60) {
  if (!placed.length) return { minX: -100, minY: -100, maxX: 100, maxY: 100 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of placed) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad + 16 }
}
