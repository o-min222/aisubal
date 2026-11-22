'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { LINK_KINDS, LINK_VISIBILITY, MAX_LINKS, validateLink, type LinkKind, type LinkVisibility, type ProfileLink } from '@/lib/profile-rules'
import { LinkIcon } from './link-icon'

type Row = { kind: LinkKind; url: string; visibility: LinkVisibility }

/** 설정 > 프로필 편집: SNS links, each with its own visibility. */
export function LinksEditor({ initial }: { initial: ProfileLink[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [])
  const [busy, setBusy] = useState(false)
  const errors = rows.map((r) => (r.url.trim() ? validateLink(r.kind, r.url) : null))
  const invalid = errors.some((e) => e && !e.ok)

  async function save() {
    if (invalid || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/links', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: rows }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '저장하지 못했어요.')
      setRows(d.links)
      toast.success('링크를 저장했어요')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const used = new Set(rows.map((r) => r.kind))
  const nextKind = (LINK_KINDS.find((k) => !used.has(k.kind)) ?? LINK_KINDS[LINK_KINDS.length - 1]).kind

  return (
    <section className="card p-4 space-y-3" aria-label="SNS 링크">
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: '#111' }}>
          SNS · 링크
        </h2>
        <p className="text-[12px] text-[#777]">링크마다 누구에게 보일지 정할 수 있어요. AI 에이전트에게는 보이지 않아요.</p>
      </div>
      {rows.length === 0 && <p className="text-[13px] text-[#888]">아직 링크가 없어요.</p>}
      {rows.map((r, i) => {
        const def = LINK_KINDS.find((k) => k.kind === r.kind)!
        const err = errors[i]
        return (
          <div key={i} className="link-row rounded-xl p-2.5 space-y-2" style={{ border: '1px solid #eee' }}>
            <div className="flex items-center gap-2">
              <LinkIcon kind={r.kind} />
              <select
                aria-label={`링크 ${i + 1} 종류`}
                value={r.kind}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as LinkKind } : x)))}
                className="rounded-lg border border-[#ddd] bg-white px-2 text-[14px] min-h-[40px]"
              >
                {LINK_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`링크 ${i + 1} 공개 범위`}
                value={r.visibility}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, visibility: e.target.value as LinkVisibility } : x)))}
                className="ml-auto rounded-lg border border-[#ddd] bg-white px-2 text-[13px] min-h-[40px]"
              >
                {LINK_VISIBILITY.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2]" aria-label={`링크 ${i + 1} 삭제`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              aria-label={`${def.label} 주소`}
              value={r.url}
              inputMode="url"
              autoCapitalize="none"
              placeholder={def.placeholder}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              className="w-full rounded-lg border px-3 py-2 text-[14.5px]"
              style={{ borderColor: err && !err.ok ? '#e5484d' : '#ddd' }}
            />
            {err && !err.ok && <p className="text-[12px] text-[#b42318]">{err.reason}</p>}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2">
        {rows.length < MAX_LINKS && (
          <button type="button" onClick={() => setRows([...rows, { kind: nextKind, url: '', visibility: 'members' }])} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
            <Plus className="w-4 h-4" /> 링크 추가
          </button>
        )}
        <button type="button" onClick={save} disabled={busy || invalid} className="btn btn-primary btn-sm min-h-[40px] rounded-full ml-auto">
          {busy ? '저장 중…' : '링크 저장'}
        </button>
      </div>
    </section>
  )
}
