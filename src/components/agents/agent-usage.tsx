import { Fragment } from 'react'
import type { AgentUsage, ToolUsage } from '@/lib/data/mcp-usage'
import { RelativeTime } from '@/components/relative-time'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

const ms = (v: number | null) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)

/** compact tool table shared by the agent page and the admin dashboard */
export async function ToolUsageList({ tools }: { tools: ToolUsage[] }) {
  const st = await getT()
  const max = Math.max(1, ...tools.map((t) => t.calls))
  return (
    <div className="mu-tools">
      {tools.map((t) => (
        <Fragment key={t.tool}>
          <code className="mu-tool-name">{t.tool}</code>
          <span className="mu-tool-bar" aria-hidden><span style={{ width: `${Math.max(3, (t.calls / max) * 100)}%` }} /></span>
          <span className="mu-tool-num">
            {t.calls}
            {t.errors > 0 && <span className="mu-err"> · {st('오류 {n}', { n: t.errors })}</span>}
            <span className="mu-dim"> · {ms(t.avgMs)}</span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}

/** A66 P3: the agent page's MCP usage (owner or admin only) */
export async function AgentUsageSection({ usage }: { usage: AgentUsage }) {
  const st = await getT()
  const u = usage
  const max = Math.max(1, ...u.byDay.map((d) => d.calls))
  const stats: [string, string][] = [
    [st('호출'), String(u.total)],
    [st('오류'), String(u.errors + u.refused)],
    [st('평균'), ms(u.avgMs)],
    ['p95', ms(u.p95Ms)],
    [st('제한됨'), String(u.limited)],
  ]
  return (
    <section className="card overflow-hidden" aria-label={st('MCP 사용량')}>
      <h2 className="ap-section-title">
        <T>MCP 사용량</T> <span className="mu-dim font-normal">· {st('최근 {n}일', { n: u.days })}</span>
      </h2>
      <div className="px-4 pb-4 space-y-4">
        <p className="mu-note">
          <T>에이전트 주인과 관리자만 볼 수 있어요.</T>
          {u.lastAt && (
            <>
              {' '}
              <T>마지막 호출</T> <RelativeTime date={u.lastAt} />
            </>
          )}
        </p>
        {u.total === 0 && u.limited === 0 ? (
          <p className="text-sm text-n-888"><T>아직 MCP 호출 기록이 없어요.</T></p>
        ) : (
          <>
            <dl className="mu-stats">
              {stats.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mu-chart" role="img" aria-label={st('일별 호출 수')}>
              {u.byDay.map((d) => (
                <div key={d.day} className="mu-day" title={`${d.day} · ${d.calls}`}>
                  <span className="mu-day-n">{d.calls || ''}</span>
                  <span className="mu-day-bar" style={{ height: `${d.calls ? Math.max(4, (d.calls / max) * 100) : 0}%` }} />
                  <span className="mu-day-label">{Number(d.day.slice(5, 7))}/{Number(d.day.slice(8, 10))}</span>
                </div>
              ))}
            </div>
            {u.byTool.length > 0 && (
              <div>
                <h3 className="mu-h3"><T>많이 쓴 툴</T></h3>
                <ToolUsageList tools={u.byTool} />
              </div>
            )}
          </>
        )}
        <div>
          <h3 className="mu-h3"><T>호출 한도</T></h3>
          <p className="mu-note">
            {st('이 에이전트: 1분 {m}/{mm} · 24시간 {d}/{dd}', { m: u.lastMinute, mm: u.limits.tokenPerMin, d: u.today, dd: u.limits.tokenPerDay })}
            <br />
            {st('주인의 에이전트 합계: 1분 {mm} · 24시간 {dd}', { mm: u.limits.memberPerMin, dd: u.limits.memberPerDay })}
            <br />
            <T>한도를 넘으면 그 호출은 실행되지 않고, 에이전트가 몇 초 뒤에 다시 시도하면 되는지 알려줘요.</T>
          </p>
        </div>
      </div>
    </section>
  )
}
