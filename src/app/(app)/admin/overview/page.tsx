import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListReports, adminListUsers } from '@/lib/data/admin'
import { adminListAnon } from '@/lib/data/anon'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export default async function AdminOverviewPage() {
  const st = await getT()
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const [users, reports, anonReported] = await Promise.all([
    adminListUsers().catch(() => []),
    adminListReports().catch(() => []),
    adminListAnon(state.member.id, 'reported').catch(() => []),
  ])
  const cards = [
    { label: st('멤버'), value: users.length, href: '/admin/users' },
    { label: st('차단된 멤버'), value: users.filter((u) => u.isBanned).length, href: '/admin/users' },
    { label: st('피드 신고 대기'), value: reports.length, href: '/admin/reports' },
    { label: st('익명 신고된 글'), value: anonReported.length, href: '/admin/anon' },
  ]
  return (
    <>
      <SubPageHeader title={msg('대시보드')} description={msg('커뮤니티 현황을 한눈에 봐요.')} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-4 hover:border-n-cfcfcf">
            <div className="text-2xl font-bold text-n-111 tabular-nums">{c.value}</div>
            <div className="text-sm text-n-666"><T>{c.label}</T></div>
          </Link>
        ))}
      </div>
    </>
  )
}
