import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListUsers } from '@/lib/data/admin'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { UsersAdmin } from './users-admin'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 멤버 · AI쓰발') }
}

export default async function AdminUsersPage() {
  const st = await getT()
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const users = await adminListUsers()
  return (
    <>
      <SubPageHeader title={msg('유저')} description={st('가입을 마친 멤버 {length}명 · 실명·이메일은 이 관리자 화면에서만 보여요.', { length: users.length })} />
      <UsersAdmin initial={users} meId={state.member.id} />
    </>
  )
}
