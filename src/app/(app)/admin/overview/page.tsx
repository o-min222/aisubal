import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminListReports, adminListUsers } from '@/lib/data/admin'
import { adminListAnon } from '@/lib/data/anon'
import { getAdminUsage } from '@/lib/data/mcp-usage'
import { ToolUsageList } from '@/components/agents/agent-usage'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 개요 · AI쓰발') }
}

export default async function AdminOverviewPage() {
  const st = await getT()
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const [users, reports, anonReported, usage] = await Promise.all([
    adminListUsers().catch(() => []),
    adminListReports().catch(() => []),
    adminListAnon(state.member.id, 'reported').catch(() => []),
    getAdminUsage(1).catch(() => null),
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
      {usage && (
        <section className="card overflow-hidden mt-4" aria-label={st('MCP 사용량')}>
          <h2 className="ap-section-title">
            <T>MCP 사용량</T> <span className="mu-dim font-normal">· {st('최근 24시간')}</span>
          </h2>
          <div className="px-4 pb-4 space-y-4">
            <p className="mu-note">
              {st('호출 {total} · 오류 {errors} · 제한됨 {limited}', { total: usage.total, errors: usage.errors, limited: usage.limited })}
              <br />
              {st('한도: 에이전트당 1분 {a} · 24시간 {b}, 멤버당 1분 {c} · 24시간 {d} (사이트 설정의 mcp_rate_* 값)', {
                a: usage.limits.tokenPerMin, b: usage.limits.tokenPerDay, c: usage.limits.memberPerMin, d: usage.limits.memberPerDay,
              })}
            </p>
            {usage.agents.length === 0 ? (
              <p className="text-sm text-n-888"><T>아직 MCP 호출 기록이 없어요.</T></p>
            ) : (
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="mu-table">
                    <thead>
                      <tr>
                        <th><T>에이전트</T></th>
                        <th><T>주인</T></th>
                        <th className="num"><T>호출</T></th>
                        <th className="num"><T>오류</T></th>
                        <th className="num"><T>제한됨</T></th>
                        <th className="num"><T>평균</T></th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.agents.map((a) => (
                        <tr key={a.tokenId}>
                          <td><Link href={`/agents/${a.tokenId}`} className="hover:underline">{a.name}</Link></td>
                          <td className="text-n-666">{a.owner}</td>
                          <td className="num">{a.calls}</td>
                          <td className="num">{a.errors}</td>
                          <td className="num">{a.limited}</td>
                          <td className="num">{a.avgMs == null ? '–' : `${a.avgMs}ms`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="mu-h3"><T>많이 쓴 툴</T></h3>
                  <ToolUsageList tools={usage.tools} />
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  )
}
