import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListUsers } from '@/lib/data/admin'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { UsersAdmin } from './users-admin'

export default async function AdminUsersPage() {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const users = await adminListUsers()
  return (
    <>
      <SubPageHeader title="유저" description={`가입을 마친 멤버 ${users.length}명 · 실명·이메일은 이 관리자 화면에서만 보여요.`} />
      <UsersAdmin initial={users} meId={state.member.id} />
    </>
  )
}
