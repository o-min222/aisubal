'use client'

import { networkHref } from '@/lib/dashboard-tabs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Crosshair, Maximize2, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ChildrenPage, GraphNode, GraphPayload } from '@/lib/data/graph'
import { bounds, layoutGraph } from '@/lib/graph-layout'
import { getAvatarColor } from '@/lib/markdown'
import { isMutual, relationBadge, type Relation } from '@/lib/social-rules'
import { UserAvatar } from '@/components/user-avatar'
import { RelationBadge } from '@/components/social/relation-badge'
import { FollowButton } from '@/components/social/follow-button'
import { FriendButton } from '@/components/social/friend-button'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type View = { x: number; y: number; k: number }
const RING_COLOR = { me: 'var(--n-111)', friend: '#2f9e66', mutual: '#7c5cff', following: '#3b82f6', follower: '#c9a227', none: 'var(--n-d4d4d4)' } as const

function tone(r: Relation): keyof typeof RING_COLOR {
  if (r.isMe) return 'me'
  if (r.friend === 'friends') return 'friend'
  if (isMutual(r)) return 'mutual'
  if (r.iFollow) return 'following'
  if (r.followsMe) return 'follower'
  return 'none'
}

/** Members-only invite network: 3 hops first, then "+N" pages per node. Pan / wheel / pinch zoom. */
export function InviteGraph({ initial }: { initial: GraphPayload }) {
  const router = useRouter()
  const [nodes, setNodes] = useState<GraphNode[]>(initial.nodes)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; target: string | null; pinch: number | null }>({ startX: 0, startY: 0, moved: false, target: null, pinch: null })
  const rootId = initial.rootId

  const { placed, edges } = useMemo(() => layoutGraph(nodes, rootId), [nodes, rootId])
  const at = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed])
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const fit = useCallback(() => {
    const el = wrap.current
    if (!el) return
    const b = bounds(placed)
    const w = el.clientWidth, h = el.clientHeight
    const k = Math.min(1.4, Math.max(0.2, Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY))))
    setView({ k, x: w / 2 - ((b.minX + b.maxX) / 2) * k, y: h / 2 - ((b.minY + b.maxY) / 2) * k })
  }, [placed])
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && placed.length) {
      fit()
      fitted.current = true
    }
  }, [fit, placed.length])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(3, Math.max(0.2, v.k * factor))
      const f = k / v.k
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
    })
  }, [])
  function zoomCenter(factor: number) {
    const el = wrap.current
    zoomAt(factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2)
  }

  // wheel zoom needs a non-passive listener to stop page scroll
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    svg.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    const t = (e.target as Element).closest('[data-node]')
    if (pointers.current.size === 1) gesture.current = { startX: e.clientX, startY: e.clientY, moved: false, target: t?.getAttribute('data-node') ?? null, pinch: null }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.moved = true
    }
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = local(e)
    pointers.current.set(e.pointerId, cur)
    if (pointers.current.size === 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(d / gesture.current.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2)
      gesture.current.pinch = d
      return
    }
    if (Math.hypot(e.clientX - gesture.current.startX, e.clientY - gesture.current.startY) > 6) gesture.current.moved = true
    if (gesture.current.moved) setView((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }))
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) return
    const g = gesture.current
    if (!g.moved) {
      if (g.target?.startsWith('more:')) loadMore(g.target.slice(5))
      else setSelected(g.target)
    }
    gesture.current.pinch = null
  }

  async function loadMore(parentId: string) {
    if (loading) return
    const parent = byId.get(parentId)
    if (!parent) return
    const offset = nodes.filter((n) => n.parentId === parentId && n.id !== rootId && (n.depth ?? 0) >= 0).length
    setLoading(parentId)
    try {
      const res = await fetch(`/api/network/children?member=${encodeURIComponent(parentId)}&offset=${offset}`)
      const data: ChildrenPage & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error || '불러오지 못했어요.')
      const depth = (parent.depth ?? 0) + 1
      setNodes((cur) => {
        const seen = new Set(cur.map((n) => n.id))
        const add = data.nodes.filter((n) => !seen.has(n.id)).map((n) => ({ ...n, parentId, depth }))
        // keep child_count authoritative so the "+N" placeholder shrinks correctly
        return [...cur.map((n) => (n.id === parentId ? { ...n, childCount: data.total } : n)), ...add]
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('불러오지 못했어요.'))
    } finally {
      setLoading(null)
    }
  }

  const setRelation = (id: string, patch: Partial<Relation>) => setNodes((cur) => cur.map((n) => (n.id === id ? { ...n, relation: { ...n.relation, ...patch } } : n)))
  const sel = selected ? byId.get(selected) : null
  const counts = useMemo(() => {
    const c = { friend: 0, mutual: 0, following: 0 }
    for (const n of nodes) {
      const t = tone(n.relation)
      if (t === 'friend' || t === 'mutual' || t === 'following') c[t]++
    }
    return c
  }, [nodes])

  return (
    <div ref={wrap} className="invite-graph relative card overflow-hidden" style={{ height: 'max(440px, calc(100dvh - 210px))', padding: 0, background: 'var(--n-fbfbfa)' }}>
      <svg
        ref={svg}
        width="100%"
        height="100%"
        role="img"
        aria-label={tx('초대 네트워크 그래프, {length}명', { length: nodes.length })}
        style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none', display: 'block' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = at.get(e.from), b = at.get(e.to)
            if (!a || !b) return null
            return <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d9d9d6" strokeWidth={1.5} strokeDasharray={b.more ? '4 4' : undefined} />
          })}
          {placed.map((p) => {
            if (p.more) {
              return (
                <g key={p.id} data-node={p.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }}>
                  <circle r={17} fill="var(--n-fff)" stroke="var(--n-999)" strokeDasharray="3 3" strokeWidth={1.5} />
                  <text textAnchor="middle" dy={4} fontSize={11} fontWeight={700} fill="var(--n-555)">
                    {loading === p.more.parentId ? '…' : `+${p.more.remaining}`}
                  </text>
                  <text textAnchor="middle" dy={34} fontSize={10.5} fill="var(--n-888)">
                    <T>더 보기</T>
                  </text>
                </g>
              )
            }
            const n = byId.get(p.id)
            if (!n) return null
            const t = tone(n.relation)
            const isRoot = p.id === rootId
            const r = isRoot ? 26 : 18
            const badge = relationBadge(n.relation)
            return (
              <g key={p.id} data-node={p.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} opacity={p.depth < 0 ? 0.85 : 1}>
                {selected === p.id && <circle r={r + 7} fill="none" stroke="var(--n-111)" strokeOpacity={0.25} strokeWidth={6} />}
                <circle r={r + 3} fill="var(--n-fff)" stroke={RING_COLOR[t]} strokeWidth={t === 'none' ? 1.5 : 3} />
                <circle r={r} fill={getAvatarColor(n.id, n.name)} />
                <text textAnchor="middle" dy={isRoot ? 6 : 4.5} fontSize={isRoot ? 16 : 12.5} fontWeight={700} fill="#fff">
                  {n.name.charAt(0).toUpperCase()}
                </text>
                <text textAnchor="middle" dy={r + 17} fontSize={11.5} fontWeight={isRoot ? 700 : 500} fill="var(--n-222)">
                  {n.name.length > 8 ? `${n.name.slice(0, 7)}…` : n.name}
                  {n.relation.isMe ? <T> (나)</T> : ''}
                </text>
                {badge && (
                  <text textAnchor="middle" dy={r + 30} fontSize={9.5} fontWeight={600} fill={RING_COLOR[t]}>
                    <T>{badge.label}</T>
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 text-[11px] pointer-events-none" aria-hidden>
        {(
          [
            ['friend', tx('친구 {friend}', { friend: counts.friend })],
            ['mutual', tx('맞팔 {mutual}', { mutual: counts.mutual })],
            ['following', tx('팔로잉 {following}', { following: counts.following })],
          ] as const
        ).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-n-fff/90 px-2 leading-[22px] shadow-sm" style={{ color: 'var(--n-444)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: RING_COLOR[k] }} /> <T>{label}</T>
          </span>
        ))}
      </div>

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoomCenter(1.3)} aria-label={tx('확대')} title={tx('확대')} className="flex items-center justify-center rounded-full bg-n-fff shadow" style={{ width: 40, height: 40, color: 'var(--n-111)' }}>
          <Plus className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => zoomCenter(1 / 1.3)} aria-label={tx('축소')} title={tx('축소')} className="flex items-center justify-center rounded-full bg-n-fff shadow" style={{ width: 40, height: 40, color: 'var(--n-111)' }}>
          <Minus className="w-4 h-4" />
        </button>
        <button type="button" onClick={fit} aria-label={tx('전체 보기')} title={tx('전체 보기')} className="flex items-center justify-center rounded-full bg-n-fff shadow" style={{ width: 40, height: 40, color: 'var(--n-111)' }}>
          <Maximize2 className="w-4 h-4" />
        </button>
        {!byId.get(rootId)?.relation.isMe && (
          <button onClick={() => router.push(networkHref())} aria-label={tx('나를 중심으로')} title={tx('나를 중심으로')} className="flex items-center justify-center rounded-full bg-n-fff shadow" style={{ width: 40, height: 40, color: 'var(--n-111)' }}>
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      {sel && (
        <div className="graph-card absolute left-2 right-2 bottom-2 md:right-auto md:w-[340px] rounded-2xl bg-n-fff p-3.5 shadow-lg" style={{ border: '1px solid var(--n-eee)' }} role="dialog" aria-label={tx('{name} 미니 프로필', { name: sel.name })}>
          <button onClick={() => setSelected(null)} className="absolute top-1.5 right-1.5 tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={tx('닫기')}>
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <UserAvatar id={sel.id} name={sel.name} avatarUrl={sel.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-[16px] truncate" style={{ color: 'var(--n-111)' }}>
                  {sel.name}
                </span>
                {sel.relation.isMe ? <span className="text-xs text-n-888"><T>(나)</T></span> : <RelationBadge relation={sel.relation} />}
              </p>
              <p className="text-[12px] text-n-777">
                {sel.parentId && byId.get(sel.parentId) ? tx('{name}님의 초대', { name: byId.get(sel.parentId)!.name }) : sel.depth != null && sel.depth < 0 ? tx('나를 초대한 줄기') : tx('초대 네트워크')}
                {tx(' · 초대한 사람 {childCount}명', { childCount: sel.childCount })}
              </p>
            </div>
          </div>
          {sel.bio && (
            <p className="text-[13px] mt-2 line-clamp-2" style={{ color: 'var(--n-444)' }}>
              {sel.bio}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {!sel.relation.isMe && (
              <>
                <FollowButton key={`f-${sel.id}`} memberId={sel.id} initialFollowing={sel.relation.iFollow} refresh={false} onChange={(following) => setRelation(sel.id, { iFollow: following })} />
                <FriendButton key={`fr-${sel.id}`} memberId={sel.id} initialState={sel.relation.friend} compact onChange={(friend) => setRelation(sel.id, { friend })} />
              </>
            )}
            <Link href={`/members/${sel.id}`} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
              <T>프로필</T>
            </Link>
            {sel.id !== rootId && (
              <Link href={networkHref({ root: sel.id })} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                <T>중심으로</T>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
