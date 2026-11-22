import Link from 'next/link'
import { EyeOff, Lock, Users } from 'lucide-react'
import type { Group } from '@/lib/data/groups'
import { ROLE_LABEL } from '@/lib/group-rules'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { GroupAvatar } from '@/components/groups/group-avatar'

export function GroupPolicy({ g }: { g: Pick<Group, 'joinPolicy' | 'isHidden'> }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: 'var(--n-777)' }}>
      <span className="inline-flex items-center gap-1">
        {g.joinPolicy === 'approval' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
        {g.joinPolicy === 'approval' ? <T>승인 후 가입</T> : <T>누구나 가입</T>}
      </span>
      {g.isHidden && (
        <span className="inline-flex items-center gap-1">
          <EyeOff className="w-3 h-3" /> <T>숨김</T>
        </span>
      )}
    </span>
  )
}

export async function GroupCard({ g }: { g: Group }) {
  const st = await getT()
  const state =
    g.myStatus === 'active' ? (g.myRole && g.myRole !== 'member' ? ROLE_LABEL[g.myRole] : st('가입됨')) : g.myStatus === 'pending' ? st('가입 요청 중') : g.myStatus === 'invited' ? st('초대받음') : null
  return (
    <Link href={`/groups/${g.slug}`} className="group-card card p-3.5 flex gap-3 hover:bg-n-fafafa">
      <GroupAvatar name={g.name} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[15px] truncate" style={{ color: 'var(--n-111)' }}>
            {g.name}
          </span>
          {state && (
            <span
              className="flex-shrink-0 rounded-full px-2 text-[11.5px] font-semibold leading-[20px]"
              style={g.myStatus === 'invited' ? { background: 'var(--c-e8f5ee)', color: 'var(--c-1f7a4d)' } : g.myStatus === 'pending' ? { background: 'var(--c-fff4e5)', color: 'var(--c-9a5b00)' } : { background: 'var(--n-f2f2f2)', color: 'var(--n-444)' }}
            >
              {state}
            </span>
          )}
        </span>
        {g.description && (
          <span className="block text-[13px] mt-0.5 line-clamp-2" style={{ color: 'var(--n-555)' }}>
            {g.description}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-3 mt-1 text-[12px]" style={{ color: 'var(--n-888)' }}>
          <span><T s="멤버 {memberCount}" vars={{ memberCount: g.memberCount }} /></span>
          <span><T s="글 {postCount}" vars={{ postCount: g.postCount }} /></span>
          <GroupPolicy g={g} />
        </span>
      </span>
    </Link>
  )
}
