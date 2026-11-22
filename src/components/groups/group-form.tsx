'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Group } from '@/lib/data/groups'
import { GROUP_SLUG_RE } from '@/lib/group-rules'
import { Switch } from '@/components/ui/switch'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

const field = 'w-full rounded-xl border border-n-ddd px-3 py-2.5 text-[15px] bg-n-fff focus:outline-none focus:border-n-111'
const label = 'block text-[13px] font-semibold mb-1'

async function send(url: string, method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || tn('저장하지 못했어요.'))
  return data
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="g-name" className={label} style={{ color: 'var(--n-111)' }}>
        <T>그룹 이름</T>
      </label>
      <input id="g-name" className={field} value={value} maxLength={40} required placeholder={tx('예) Claude Code 실전')} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function DescField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="g-desc" className={label} style={{ color: 'var(--n-111)' }}>
        <T>그룹 소개</T>
      </label>
      <textarea id="g-desc" className={field} rows={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} placeholder={tx('어떤 이야기를 나누는 그룹인가요?')} />
    </div>
  )
}

/** 그룹 만들기: just a name and an intro. The address is generated from the name, the group
 *  starts open and listed; the owner changes any of that later in the 설정 tab. */
export function CreateGroupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const data = await send('/api/groups', 'POST', { name, description })
      toast.success(tn('그룹을 만들었어요'))
      router.push(`/groups/${data.group.slug}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3 group-create">
      <NameField value={name} onChange={setName} />
      <DescField value={description} onChange={setDescription} />
      <p className="text-[12.5px] text-n-888">
        <T>주소·가입 방식·공개 여부는 만든 뒤 그룹 설정에서 바꿀 수 있어요.</T>
      </p>
      <button type="submit" disabled={busy || name.trim().length < 2} className="btn btn-primary w-full min-h-[48px] rounded-full">
        {busy ? <T>만드는 중…</T> : <T>그룹 만들기</T>}
      </button>
    </form>
  )
}

/** Owner settings: name, intro, address, 가입 방식 (segmented), 숨김 (trailing switch), delete. */
export function GroupSettingsForm({ group }: { group: Group }) {
  const router = useRouter()
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [slug, setSlug] = useState(group.slug)
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval'>(group.joinPolicy)
  const [isHidden, setIsHidden] = useState(group.isHidden)
  const [busy, setBusy] = useState(false)
  const slugOk = GROUP_SLUG_RE.test(slug)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !slugOk) return
    setBusy(true)
    try {
      const data = await send(`/api/groups/${group.id}`, 'PATCH', {
        name,
        description,
        joinPolicy,
        isHidden,
        ...(slug !== group.slug ? { slug } : {}),
      })
      toast.success(tn('설정을 저장했어요'))
      const next = data.slug || group.slug
      router.push(`/groups/${next}?tab=settings`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(tn("'{name}' 그룹을 삭제할까요? 그룹 타임라인 글도 함께 지워져요. 그룹 모임은 개인 모임으로 남아요.", { name: group.name }))) return
    const res = await fetch(`/api/groups/${group.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete' }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('삭제하지 못했어요.'))
    toast.success(tn('그룹을 삭제했어요'))
    router.push('/groups')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-4 group-settings">
      <NameField value={name} onChange={setName} />
      <DescField value={description} onChange={setDescription} />
      <div>
        <label htmlFor="g-slug" className={label} style={{ color: 'var(--n-111)' }}>
          <T>주소</T>
        </label>
        <div className="flex items-center gap-1 text-[14px] text-n-777 min-w-0">
          <span className="whitespace-nowrap">/groups/</span>
          <input id="g-slug" className={field} value={slug} maxLength={40} required placeholder="claude-code" onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
        </div>
        {!slugOk ? (
          <p className="text-[12px] text-c-b42318 mt-1"><T>영문 소문자·숫자·하이픈 2~40자</T></p>
        ) : slug !== group.slug ? (
          <p className="text-[12px] text-n-888 mt-1"><T>예전 주소로 들어와도 새 주소로 이동해요.</T></p>
        ) : null}
      </div>
      <div>
        <span className={label} style={{ color: 'var(--n-111)' }}>
          <T>가입 방식</T>
        </span>
        <div className="seg" role="group" aria-label={tx('가입 방식')}>
          <button type="button" aria-pressed={joinPolicy === 'open'} className={joinPolicy === 'open' ? 'on' : ''} onClick={() => setJoinPolicy('open')}>
            <T>누구나 가입</T>
          </button>
          <button type="button" aria-pressed={joinPolicy === 'approval'} className={joinPolicy === 'approval' ? 'on' : ''} onClick={() => setJoinPolicy('approval')}>
            <T>승인 후 가입</T>
          </button>
        </div>
        <p className="text-[12px] text-n-777 mt-1">
          {joinPolicy === 'open' ? <T>멤버라면 바로 가입하고 타임라인을 볼 수 있어요</T> : <T>소유자·매니저가 요청을 승인해요. 타임라인은 멤버만</T>}
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}>
            <T>숨김 그룹</T>
          </span>
          <span className="block text-[12px] text-n-888">
            <T>목록·검색에 안 보여요. 초대받은 사람만 들어올 수 있어요.</T>
          </span>
        </span>
        <Switch checked={isHidden} onCheckedChange={(v) => setIsHidden(Boolean(v))} aria-label={tx('숨김 그룹')} />
      </label>
      <button type="submit" disabled={busy || !slugOk || name.trim().length < 2} className="btn btn-primary w-full min-h-[48px] rounded-full">
        {busy ? <T>저장 중…</T> : <T>설정 저장</T>}
      </button>
      <button type="button" onClick={remove} className="w-full min-h-[44px] rounded-full text-[14px] font-semibold" style={{ color: 'var(--c-b42318)', border: '1px solid var(--c-f3c7c3)' }}>
        <T>그룹 삭제</T>
      </button>
    </form>
  )
}
