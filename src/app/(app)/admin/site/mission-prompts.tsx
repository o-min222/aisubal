'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { AdminPrompt } from '@/lib/data/onboarding'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

type Draft = { id: string | null; ko: string; en: string }

/** A54: the first questions new members get (one per member, rotating over the active ones). */
export function MissionPrompts({ initial }: { initial: AdminPrompt[] }) {
  const [list, setList] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(init: RequestInit, url = '/api/admin/onboarding-prompts') {
    setBusy(true)
    try {
      const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('저장하지 못했어요.'))
      setList(data.prompts)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!draft) return
    if (await call({ method: 'POST', body: JSON.stringify({ id: draft.id, ko: draft.ko, en: draft.en || null }) })) setDraft(null)
  }
  const toggle = (p: AdminPrompt, active: boolean) => call({ method: 'POST', body: JSON.stringify({ id: p.id, ko: p.ko, en: p.en, active }) })
  const remove = (p: AdminPrompt) => {
    if (!window.confirm(tx('이 질문을 삭제할까요? 이미 올라온 첫 글은 그대로 남아요.'))) return
    void call({ method: 'DELETE' }, `/api/admin/onboarding-prompts?id=${encodeURIComponent(p.id)}`)
  }
  const activeN = list.filter((p) => p.active).length

  return (
    <section className="card p-4 space-y-3" aria-label={tx('첫 질문')}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-n-111"><T>가입 첫 질문</T></h2>
          <p className="text-xs text-n-888"><T s="새 멤버마다 켜진 질문 {n}개 중 하나를 받아요. 답이 첫 글(전체 회원)이 돼요." vars={{ n: activeN }} /></p>
        </div>
        {!draft && (
          <button type="button" className="icon-btn tap-target inline-flex items-center justify-center rounded-full" aria-label={tx('질문 추가')} title={tx('질문 추가')} onClick={() => setDraft({ id: null, ko: '', en: '' })}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      <ul className="mp-list">
        {list.map((p) => (
          <li key={p.id} className="mp-row">
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] ${p.active ? 'text-n-111' : 'text-n-999'}`}>{p.ko}</p>
              {p.en && <p className="text-[12px] text-n-888 truncate">{p.en}</p>}
            </div>
            <ToggleSwitch checked={p.active} onChange={(v) => void toggle(p, v)} label={tx('질문 켜기')} />
            <button type="button" className="icon-btn tap-target inline-flex items-center justify-center rounded-full" aria-label={tx('수정')} onClick={() => setDraft({ id: p.id, ko: p.ko, en: p.en ?? '' })}>
              <Pencil className="w-4 h-4" />
            </button>
            <button type="button" className="icon-btn tap-target inline-flex items-center justify-center rounded-full text-red-600" aria-label={tx('삭제')} onClick={() => remove(p)}>
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      {draft && (
        <div className="space-y-2 pt-1">
          <input className="input" placeholder={tx('질문 (한국어)')} value={draft.ko} maxLength={140} onChange={(e) => setDraft({ ...draft, ko: e.target.value })} autoFocus />
          <input className="input" placeholder={tx('Question (English, 선택)')} value={draft.en} maxLength={140} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost min-h-[40px]" onClick={() => setDraft(null)}><T>취소</T></button>
            <button type="button" className="btn btn-primary min-h-[40px]" disabled={busy || draft.ko.trim().length < 4} onClick={save}><T>저장</T></button>
          </div>
        </div>
      )}
    </section>
  )
}
