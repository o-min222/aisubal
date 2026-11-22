import type { Group } from '@/lib/data/groups'
import { ROLE_LABEL } from '@/lib/group-rules'
import { GroupPolicy } from '@/components/groups/group-card'
import { CompactRow } from './compact-row'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** Compact 그룹 row; groups open as their own space (timeline + tabs), not in a pane. */
export async function GroupRow({ g }: { g: Group }) {
  const st = await getT()
  const state =
    g.myStatus === 'active' ? (g.myRole && g.myRole !== 'member' ? ROLE_LABEL[g.myRole] : null) : g.myStatus === 'pending' ? st('가입 요청 중') : g.myStatus === 'invited' ? st('초대받음') : null
  return (
    <CompactRow
      save={{ kind: 'group', refId: g.slug, hint: { title: g.name } }}
      href={`/groups/${g.slug}`}
      leading={
        <span aria-hidden className="flex items-center justify-center rounded-xl text-[20px]" style={{ width: 42, height: 42, background: 'var(--c-f3f0ff)' }}>
          {g.emoji || '#'}
        </span>
      }
      title={g.name}
      badge={state ? <span className="crow-chip" style={g.myStatus === 'invited' ? { background: 'var(--c-e8f5ee)', color: 'var(--c-1f7a4d)' } : g.myStatus === 'pending' ? { background: 'var(--c-fff4e5)', color: 'var(--c-9a5b00)' } : undefined}>{state}</span> : null}
      preview={g.description || undefined}
      meta={
        <>
          <span><T s="멤버 {memberCount}" vars={{ memberCount: g.memberCount }} /></span>
          <span><T s="글 {postCount}" vars={{ postCount: g.postCount }} /></span>
          <GroupPolicy g={g} />
        </>
      }
    />
  )
}
