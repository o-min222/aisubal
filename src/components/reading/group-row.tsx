import type { Group } from '@/lib/data/groups'
import { ROLE_LABEL } from '@/lib/group-rules'
import { GroupPolicy } from '@/components/groups/group-card'
import { CompactRow } from './compact-row'

/** Compact 그룹 row; groups open as their own space (timeline + tabs), not in a pane. */
export function GroupRow({ g }: { g: Group }) {
  const state =
    g.myStatus === 'active' ? (g.myRole && g.myRole !== 'member' ? ROLE_LABEL[g.myRole] : null) : g.myStatus === 'pending' ? '가입 요청 중' : g.myStatus === 'invited' ? '초대받음' : null
  return (
    <CompactRow
      href={`/groups/${g.slug}`}
      leading={
        <span aria-hidden className="flex items-center justify-center rounded-xl text-[20px]" style={{ width: 42, height: 42, background: '#f3f0ff' }}>
          {g.emoji || '#'}
        </span>
      }
      title={g.name}
      badge={state ? <span className="crow-chip" style={g.myStatus === 'invited' ? { background: '#e8f5ee', color: '#1f7a4d' } : g.myStatus === 'pending' ? { background: '#fff4e5', color: '#9a5b00' } : undefined}>{state}</span> : null}
      preview={g.description || undefined}
      meta={
        <>
          <span>멤버 {g.memberCount}</span>
          <span>글 {g.postCount}</span>
          <GroupPolicy g={g} />
        </>
      }
    />
  )
}
