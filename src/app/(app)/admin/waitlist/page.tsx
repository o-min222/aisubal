import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListWaitlist, waitlistCount } from '@/lib/data/public-waitlist'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { WaitlistAdmin } from './waitlist-admin'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 대기 명단 · AI쓰발') }
}

/** A57: people who signed up at /join. Inviting issues a code to copy and send yourself. */
export default async function AdminWaitlistPage() {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const [entries, waiting] = await Promise.all([adminListWaitlist('waiting').catch(() => []), waitlistCount().catch(() => 0)])
  return (
    <>
      <SubPageHeader title={msg('대기 명단')} description={msg('/join에서 신청한 사람들. 초대하면 코드가 만들어지고, 보내는 건 직접 해요.')} />
      <WaitlistAdmin initial={entries} waiting={waiting} />
    </>
  )
}
