'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Trash2, UserSearch, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { RelativeTime } from '@/components/relative-time'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { categoryLabel, type AnonRow } from '@/lib/anon-rules'
import type { AnonLogEntry, AnonTrace } from '@/lib/data/anon'

type Filter = 'hidden' | 'reported' | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'hidden', label: '숨겨진 글' },
  { id: 'reported', label: '신고된 글' },
  { id: 'all', label: '전체' },
]
const ACTION_LABEL: Record<string, string> = {
  auto_hide: '자동 숨김',
  hide: '숨김',
  unhide: '숨김 해제',
  delete: '삭제',
  trace: '작성자 조회',
}

/** Admin-only 익명 moderation: hidden/reported queue, unhide, delete, logged author trace. */
export function AnonModeration() {
  const [filter, setFilter] = useState<Filter>('hidden')
  const [posts, setPosts] = useState<AnonRow[] | null>(null)
  const [log, setLog] = useState<AnonLogEntry[]>([])
  const [traceFor, setTraceFor] = useState<AnonRow | null>(null)
  const [traceReason, setTraceReason] = useState('')
  const [trace, setTrace] = useState<AnonTrace | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (f: Filter) => {
    setPosts(null)
    const res = await fetch(`/api/admin/anon?filter=${f}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || '불러오지 못했어요.')
      setPosts([])
      return
    }
    setPosts(data.posts || [])
    setLog(data.log || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(filter)
  }, [filter, load])

  async function setHidden(p: AnonRow, hidden: boolean) {
    const res = await fetch(`/api/admin/anon/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || '실패했어요.')
    toast.success(hidden ? '숨겼어요' : '숨김을 해제했어요. 이후 신고로는 자동 숨김되지 않아요.')
    load(filter)
  }

  async function remove(p: AnonRow) {
    const reason = prompt('삭제 사유 (운영 기록에 남아요)')
    if (reason === null) return
    const res = await fetch(`/api/admin/anon/${p.id}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || '실패했어요.')
    toast.success('삭제했어요 (답글 포함)')
    load(filter)
  }

  async function runTrace() {
    if (!traceFor || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/anon/${traceFor.id}/trace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: traceReason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '조회하지 못했어요.')
      setTrace(data)
      load(filter)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="text-lg font-bold" style={{ color: '#111' }}>익명 게시판 관리</h2>
        <p className="mt-1 text-xs text-[#777] flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          작성자 조회는 신고된 악용 대응에만 쓰세요. 조회할 때마다 사유와 함께 운영 기록에 남아요.
        </p>
        <div className="chip-row mt-3">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`filter-chip ${filter === f.id ? 'on' : ''}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {posts === null && <div className="card p-6"><span className="skeleton h-4 w-1/2 rounded block" /></div>}
        {posts?.length === 0 && <div className="card p-8 text-center text-sm text-[#888]">해당하는 글이 없어요.</div>}
        {posts?.map((p) => (
          <article key={p.id} className="card p-4">
            <header className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-semibold">{p.alias}</span>
              {p.parentId ? <span className="cat-chip">답글</span> : <span className="cat-chip">{categoryLabel(p.category)}</span>}
              {p.isHidden && <span className="badge badge-note">{p.hiddenReason === 'admin' ? '운영자 숨김' : '신고 누적 숨김'}</span>}
              {p.isDeleted && <span className="badge badge-note">작성자 삭제</span>}
              {p.adminCleared && <span className="badge badge-note">검토 완료</span>}
              <span className="text-[#888] text-xs ml-auto"><RelativeTime date={p.createdAt} /></span>
            </header>
            <p className="mt-2 text-[14px] whitespace-pre-wrap break-words text-[#111]">{p.body || '(내용 없음)'}</p>
            {(p.reportCount ?? 0) > 0 && (
              <p className="mt-2 text-xs text-red-600">
                신고 {p.reportCount}건 · {(p.reportReasons || []).join(', ')}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!p.parentId && !p.isHidden && (
                <Link href={`/anon/${p.id}`} className="btn btn-secondary btn-sm min-h-[40px]">열기</Link>
              )}
              {p.isHidden ? (
                <button type="button" onClick={() => setHidden(p, false)} className="btn btn-secondary btn-sm min-h-[40px]">
                  <Eye className="w-4 h-4" /> 숨김 해제
                </button>
              ) : (
                <button type="button" onClick={() => setHidden(p, true)} className="btn btn-secondary btn-sm min-h-[40px]">
                  <EyeOff className="w-4 h-4" /> 숨기기
                </button>
              )}
              <button type="button" onClick={() => remove(p)} className="btn btn-secondary btn-sm min-h-[40px] text-red-600">
                <Trash2 className="w-4 h-4" /> 삭제
              </button>
              <button
                type="button"
                onClick={() => {
                  setTraceFor(p)
                  setTrace(null)
                  setTraceReason('')
                }}
                className="btn btn-secondary btn-sm min-h-[40px]"
              >
                <UserSearch className="w-4 h-4" /> 작성자 조회
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-[#111]">운영 기록</h2>
        {log.length === 0 ? (
          <p className="mt-2 text-xs text-[#888]">기록이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eee]">
            {log.slice(0, 30).map((l) => (
              <li key={l.id} className="py-2 text-xs text-[#555] flex flex-wrap gap-x-2">
                <b className="text-[#111]">{ACTION_LABEL[l.action] || l.action}</b>
                <span>{l.admin || '시스템'}</span>
                {l.reason && <span className="text-[#888]">· {l.reason}</span>}
                <span className="ml-auto text-[#999]"><RelativeTime date={l.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdaptiveSheet open={Boolean(traceFor)} onOpenChange={(v) => !v && setTraceFor(null)} title="작성자 조회">
        {trace ? (
          <div className="space-y-2 py-1 text-sm">
            <p>
              <b>{trace.displayName}</b> {trace.isBanned && <span className="badge badge-note">정지됨</span>}
            </p>
            <p className="text-xs text-[#666]">최근 30일 익명 글·답글 {trace.anonPostsLast30d}개 · 숨겨진 글 {trace.hiddenPosts}개</p>
            <p className="text-xs text-[#888]">회원 정지는 관리 › 사용자 탭에서 할 수 있어요. 이 조회는 운영 기록에 남았어요.</p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <p className="text-xs text-[#666]">조회 사유를 적어주세요. 사유와 조회자가 운영 기록에 남아요.</p>
            <textarea
              value={traceReason}
              onChange={(e) => setTraceReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="예: 개인정보 노출 신고 5건 — 재발 방지 조치"
              className="input w-full text-sm"
            />
            <button type="button" onClick={runTrace} disabled={busy || traceReason.trim().length < 4} className="btn btn-primary w-full min-h-[44px]">
              {busy ? '조회 중…' : '조회하기'}
            </button>
          </div>
        )}
      </AdaptiveSheet>
    </div>
  )
}
