'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { LINK_KINDS, MAX_LINKS, detectLinkKind, shortLinkLabel, validateLink, type LinkKind, type LinkVisibility, type ProfileLink } from '@/lib/profile-rules'
import { LinkIcon } from './link-icon'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type Row = { kind: LinkKind; url: string; visibility: LinkVisibility }

/**
 * A47: SNS links as compact rows. Paste a URL to add one (platform read from the URL); tap a row to
 * edit it inline with a small × to delete. Saves on every change. Each link keeps the visibility it
 * was stored with (the per-link picker is gone from the UI, like A41).
 */
export function LinksEditor({ initial }: { initial: ProfileLink[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initial)
  const [draft, setDraft] = useState('')
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [editErr, setEditErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (editing === null) return
    const close = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setEditing(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [editing])

  async function persist(next: Row[]): Promise<boolean> {
    const prev = rows
    setRows(next)
    setBusy(true)
    try {
      const res = await fetch('/api/profile/links', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: next }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tx('저장하지 못했어요.'))
      setRows(d.links)
      router.refresh()
      return true
    } catch (e) {
      setRows(prev)
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  function check(raw: string, prev?: LinkKind): { ok: true; row: Omit<Row, 'visibility'> } | { ok: false; reason: string } {
    const kind = detectLinkKind(raw, prev)
    const v = validateLink(kind, raw)
    return v.ok ? { ok: true, row: { kind, url: v.url } } : { ok: false, reason: v.reason }
  }

  async function add() {
    if (!draft.trim() || busy) return
    const c = check(draft)
    if (!c.ok) return setDraftErr(c.reason)
    if (rows.some((r) => r.url === c.row.url)) return setDraftErr(tx('이미 있는 링크예요.'))
    if (await persist([...rows, { ...c.row, visibility: 'members' }])) setDraft('')
  }

  async function saveEdit(i: number) {
    const r = rows[i]
    if (!r) return setEditing(null)
    if (!editVal.trim()) return remove(i)
    const c = check(editVal, r.kind)
    if (!c.ok) return setEditErr(c.reason)
    if (c.row.url !== r.url && !(await persist(rows.map((x, j) => (j === i ? { ...x, ...c.row } : x))))) return
    setEditing(null)
  }

  async function remove(i: number) {
    setEditing(null)
    await persist(rows.filter((_, j) => j !== i))
  }

  return (
    <div className="lk-editor">
      {rows.length > 0 && (
        <ul className="lk-list" ref={listRef}>
          {rows.map((r, i) => {
            const label = tx(LINK_KINDS.find((k) => k.kind === r.kind)?.label ?? '')
            return (
              <li key={`${r.url}-${i}`} className={`lk-row${editing === i ? ' on' : ''}`}>
                <LinkIcon kind={r.kind} size={22} />
                {editing === i ? (
                  <>
                    <input
                      className="lk-input"
                      autoFocus
                      value={editVal}
                      inputMode="url"
                      autoCapitalize="none"
                      aria-label={tx('{label} 주소', { label })}
                      onChange={(e) => { setEditVal(e.target.value); setEditErr(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void saveEdit(i) }
                        if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) }
                      }}
                      onBlur={(e) => { if (!e.relatedTarget?.closest?.('.lk-x')) void saveEdit(i) }}
                    />
                    <button type="button" className="lk-x" aria-label={tx('{label} 링크 삭제', { label })} onClick={() => void remove(i)}>
                      <X className="w-3.5 h-3.5" strokeWidth={2.25} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="lk-row-btn"
                    aria-label={tx('{label} 링크 편집: {url}', { label, url: r.url })}
                    onClick={() => { setEditing(i); setEditVal(r.url); setEditErr(null) }}
                  >
                    {shortLinkLabel(r.kind, r.url)}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editErr && editing !== null && <p className="lk-err" role="alert">{editErr}</p>}
      {rows.length < MAX_LINKS && (
        <form className="lk-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <input
            className="lk-input"
            value={draft}
            inputMode="url"
            autoCapitalize="none"
            placeholder={tx('링크 붙여넣기')}
            aria-label={tx('추가할 링크 주소')}
            onChange={(e) => { setDraft(e.target.value); setDraftErr(null) }}
          />
          <button type="submit" className="lk-add-btn" disabled={!draft.trim() || busy}>
            <T>추가</T>
          </button>
        </form>
      )}
      {draftErr ? <p className="lk-err" role="alert">{draftErr}</p> : <p className="lk-hint"><T>X·GitHub·인스타 등은 주소로 알아서 맞춰요 · 에이전트에겐 안 보여요</T></p>}
    </div>
  )
}
