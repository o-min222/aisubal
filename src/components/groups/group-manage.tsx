'use client'

import { msg } from '@/i18n/translate'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { canRemove, ROLE_LABEL, type GroupRole } from '@/lib/group-rules'
import type { GroupMember } from '@/lib/data/groups'
import { groupAct } from './group-actions'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

function useAct(groupId: string) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function run(key: string, body: Record<string, unknown>, ok: string) {
    if (busy) return
    setBusy(key)
    try {
      await groupAct(groupId, body)
      toast.success(tn(ok))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/** Per-member controls on the 멤버 tab (owner: roles + remove + transfer; mod: remove plain members). */
export function MemberControls({ groupId, member, myRole, isSelf }: { groupId: string; member: GroupMember; myRole: GroupRole | null; isSelf: boolean }) {
  const { busy, run } = useAct(groupId)
  const removable = canRemove(myRole, member.role, isSelf)
  const owner = myRole === 'owner' && !isSelf && member.role !== 'owner'
  if (!removable && !owner) return null
  return (
    <span className="flex items-center gap-1">
      {owner && (
        <select
          aria-label={tx('{name} 역할', { name: member.name })}
          value={member.role}
          disabled={busy !== null}
          className="rounded-full border border-n-ddd bg-n-fff px-2 text-[12.5px] min-h-[36px]"
          onChange={(e) => {
            const role = e.target.value as GroupRole
            if (role === 'owner' && !confirm(tn('{name}님에게 소유권을 넘길까요? 나는 매니저가 돼요.', { name: member.name }))) return
            run('role', { action: 'role', memberId: member.id, role }, role === 'owner' ? msg('소유권을 넘겼어요') : tn('{role}(으)로 바꿨어요', { role: tn(ROLE_LABEL[role]) }))
          }}
        >
          <option value="member">{tx('멤버')}</option>
          <option value="mod">{tx('매니저')}</option>
          <option value="owner">{tx('소유권 넘기기')}</option>
        </select>
      )}
      {removable && (
        <button
          className="rounded-full px-2.5 text-[12.5px] min-h-[36px]"
          style={{ color: 'var(--c-b42318)', border: '1px solid var(--c-f3c7c3)' }}
          disabled={busy !== null}
          onClick={() => confirm(tn('{name}님을 그룹에서 내보낼까요?', { name: member.name })) && run('rm', { action: 'remove', memberId: member.id }, msg('내보냈어요'))}
        >
          <T>내보내기</T>
        </button>
      )}
    </span>
  )
}

/** 요청 tab (owner/mod): pending join requests, open invitations, and invite-by-name. */
export function GroupRequests({ groupId, pending, invited, memberIds }: { groupId: string; pending: GroupMember[]; invited: GroupMember[]; memberIds: string[] }) {
  const { busy, run } = useAct(groupId)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; avatarUrl: string | null }>>([])
  const [searching, setSearching] = useState(false)
  const known = new Set([...memberIds, ...pending.map((p) => p.id), ...invited.map((p) => p.id)])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length < 1) return
    setSearching(true)
    try {
      const res = await fetch(`/api/members/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(data.members || [])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-3">
      <section className="card" aria-label={tx('가입 요청')}>
        <h2 className="px-4 pt-3 pb-1 text-[14px] font-bold" style={{ color: 'var(--n-111)' }}>
          <T>가입 요청</T> <span className="tabular-nums text-n-999 font-normal">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-n-888"><T>대기 중인 요청이 없어요.</T></p>
        ) : (
          pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--n-f0f0f0)' }}>
              <UserAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[15px] truncate" style={{ color: 'var(--n-111)' }}>
                  {p.name}
                </span>
                {p.message && <span className="block text-[12.5px] text-n-666">“{p.message}”</span>}
              </span>
              <button className="btn btn-primary btn-sm min-h-[40px] rounded-full" disabled={busy !== null} onClick={() => run(`a${p.id}`, { action: 'decide', memberId: p.id, accept: true }, msg('가입을 승인했어요'))}>
                <T>승인</T>
              </button>
              <button className="btn btn-secondary btn-sm min-h-[40px] rounded-full" disabled={busy !== null} onClick={() => run(`d${p.id}`, { action: 'decide', memberId: p.id, accept: false }, msg('요청을 거절했어요'))}>
                <T>거절</T>
              </button>
            </div>
          ))
        )}
      </section>

      <section className="card p-4 space-y-2" aria-label={tx('초대')}>
        <h2 className="text-[14px] font-bold" style={{ color: 'var(--n-111)' }}>
          <T>멤버 초대</T>
        </h2>
        <p className="text-[12.5px] text-n-777"><T>초대받은 사람은 그룹 페이지에서 수락하면 바로 가입돼요. 숨김 그룹은 초대로만 들어올 수 있어요.</T></p>
        <form onSubmit={search} className="flex gap-2">
          <label className="flex-1 flex items-center gap-2 rounded-full border border-n-ddd px-3">
            <Search className="w-4 h-4 text-n-999" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('이름으로 찾기')} className="flex-1 py-2 text-[15px] bg-transparent focus:outline-none" aria-label={tx('초대할 멤버 이름')} />
          </label>
          <button className="btn btn-secondary btn-sm min-h-[40px] rounded-full" disabled={searching}>
            <T>찾기</T>
          </button>
        </form>
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-1.5">
            <UserAvatar id={r.id} name={r.name} avatarUrl={r.avatarUrl} size="sm" />
            <span className="flex-1 text-[14px] truncate" style={{ color: 'var(--n-111)' }}>
              {r.name}
            </span>
            {known.has(r.id) ? (
              <span className="text-[12px] text-n-888">{memberIds.includes(r.id) ? <T>이미 멤버</T> : <T>요청·초대 중</T>}</span>
            ) : (
              <button className="btn btn-primary btn-sm min-h-[36px] rounded-full" disabled={busy !== null} onClick={() => run(`i${r.id}`, { action: 'invite', memberId: r.id }, msg('초대했어요'))}>
                <T>초대</T>
              </button>
            )}
          </div>
        ))}
        {invited.length > 0 && (
          <p className="text-[12.5px] text-n-777 pt-1"><T s="초대 대기: {v}" vars={{ v: invited.map((i) => i.name).join(', ') }} /></p>
        )}
      </section>
    </div>
  )
}
