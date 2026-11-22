'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Group } from '@/lib/data/groups'
import { GROUP_SLUG_RE, slugify } from '@/lib/group-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

const field = 'w-full rounded-xl border border-[#ddd] px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:border-[#111]'

/** Create (no `edit`) or owner settings (with `edit`). The address can't change after creation. */
export function GroupForm({ edit }: { edit?: Group }) {
  const router = useRouter()
  const [name, setName] = useState(edit?.name ?? '')
  const [slug, setSlug] = useState(edit?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(edit))
  const [description, setDescription] = useState(edit?.description ?? '')
  const [emoji, setEmoji] = useState(edit?.emoji ?? '')
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval'>(edit?.joinPolicy ?? 'open')
  const [isHidden, setIsHidden] = useState(edit?.isHidden ?? false)
  const [busy, setBusy] = useState(false)
  const slugOk = GROUP_SLUG_RE.test(slug)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(edit ? `/api/groups/${edit.id}` : '/api/groups', {
        method: edit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description, emoji: emoji || null, joinPolicy, isHidden }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.')
      toast.success(edit ? tn('설정을 저장했어요') : tn('그룹을 만들었어요'))
      router.push(`/groups/${edit ? edit.slug : data.group.slug}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!edit || !confirm(tn("'{name}' 그룹을 삭제할까요? 그룹 타임라인 글도 함께 지워져요. 그룹 모임은 개인 모임으로 남아요.", { name: edit.name }))) return
    const res = await fetch(`/api/groups/${edit.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete' }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('삭제하지 못했어요.'))
    toast.success(tn('그룹을 삭제했어요'))
    router.push('/groups')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="flex gap-2">
        <div style={{ width: 72 }}>
          <label htmlFor="g-emoji" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            <T>아이콘</T>
          </label>
          <input id="g-emoji" className={`${field} text-center`} value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🤖" />
        </div>
        <div className="flex-1 min-w-0">
          <label htmlFor="g-name" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            <T>그룹 이름</T>
          </label>
          <input
            id="g-name"
            className={field}
            value={name}
            maxLength={40}
            required
            placeholder={tx('예) Claude Code 실전')}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
          />
        </div>
      </div>
      <div>
        <label htmlFor="g-slug" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}><T s="주소 {v}" vars={{ v: edit && <span className="font-normal text-[#888]"><T>(바꿀 수 없어요)</T></span> }} /></label>
        <div className="flex items-center gap-1 text-[14px] text-[#777]">
          <span className="whitespace-nowrap">/groups/</span>
          <input
            id="g-slug"
            className={field}
            value={slug}
            disabled={Boolean(edit)}
            maxLength={40}
            required
            placeholder="claude-code"
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value.toLowerCase())
            }}
          />
        </div>
        {!edit && slug && !slugOk && <p className="text-[12px] text-[#b42318] mt-1"><T>영문 소문자·숫자·하이픈 2~40자</T></p>}
      </div>
      <div>
        <label htmlFor="g-desc" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
          <T>소개</T>
        </label>
        <textarea id="g-desc" className={field} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tx('어떤 이야기를 나누는 그룹인가요?')} />
      </div>
      <fieldset>
        <legend className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
          <T>가입 방식</T>
        </legend>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
          {[
            { v: 'open' as const, t: tx('누구나 가입'), d: <T>멤버라면 바로 가입하고 타임라인을 볼 수 있어요</T> },
            { v: 'approval' as const, t: tx('승인 후 가입'), d: <T>소유자·매니저가 요청을 승인해요. 타임라인은 멤버만</T> },
          ].map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={joinPolicy === o.v} onClick={() => setJoinPolicy(o.v)} className="text-left rounded-xl px-3 py-2.5" style={{ border: joinPolicy === o.v ? '2px solid #111' : '1px solid #ddd' }}>
              <span className="block text-[14px] font-semibold" style={{ color: '#111' }}>
                {o.t}
              </span>
              <span className="block text-[12px] text-[#777] mt-0.5">{o.d}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm min-h-[40px]" style={{ color: '#333' }}>
        <input type="checkbox" checked={isHidden} onChange={(e) => setIsHidden(e.target.checked)} className="w-4 h-4 mt-0.5" />
        <span>
          <T>숨김 그룹</T> <span className="block text-[12px] text-[#888]"><T>목록·검색에 안 보여요. 초대받은 사람만 들어올 수 있어요.</T></span>
        </span>
      </label>
      <button type="submit" disabled={busy || (!edit && !slugOk)} className="btn btn-primary w-full min-h-[48px] rounded-full">
        {busy ? <T>저장 중…</T> : edit ? <T>설정 저장</T> : <T>그룹 만들기</T>}
      </button>
      {edit && (
        <button type="button" onClick={remove} className="w-full min-h-[44px] rounded-full text-[14px] font-semibold" style={{ color: '#b42318', border: '1px solid #f3c7c3' }}>
          <T>그룹 삭제</T>
        </button>
      )}
    </form>
  )
}
