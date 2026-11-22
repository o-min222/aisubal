import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getInviteTree } from '@/lib/data/invites'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { InviteTree, type TreeNode } from './invite-tree'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 초대 · AI쓰발') }
}

export default async function AdminInvitesPage() {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const tree = (await getInviteTree().catch(() => null)) as TreeNode | null
  return (
    <>
      <SubPageHeader title={msg('초대 트리')} description={msg('누가 누구를 초대했는지 보여요 (Lobsters 방식).')} />
      <div className="card p-3">{tree ? <InviteTree node={tree} /> : <p className="p-4 text-sm text-n-888"><T>트리를 불러오지 못했어요.</T></p>}</div>
    </>
  )
}
