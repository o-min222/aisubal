import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListReports } from '@/lib/data/admin'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ReportsAdmin } from './reports-admin'

export default async function AdminReportsPage() {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const reports = await adminListReports().catch(() => [])
  return (
    <>
      <SubPageHeader title="신고" description="피드 게시물 신고. 익명 게시판 신고는 ‘익명 관리’에서 처리해요." />
      <ReportsAdmin initial={reports} />
    </>
  )
}
