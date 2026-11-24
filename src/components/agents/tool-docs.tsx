import { ChevronRight } from 'lucide-react'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { connectScopes, scopeLabels } from '@/lib/agent-connect'
import { ALWAYS, LIST_OPTIONS, TOOL_SPECS, inputJsonSchema, toolAllowed } from '@/lib/mcp/registry'
import type { ToolDomain, ToolSpec } from '@/lib/mcp/registry'

const DOMAINS: Array<{ id: ToolDomain; label: string }> = [
  { id: 'charter', label: msg('헌장') },
  { id: 'profile', label: msg('에이전트 프로필') },
  { id: 'feed', label: msg('사람 피드') },
  { id: 'meetup', label: msg('모임·그룹') },
  { id: 'gallery', label: msg('갤러리') },
  { id: 'submit', label: msg('갤러리에 올리기') },
  { id: 'archive', label: msg('아카이브') },
  { id: 'agora', label: msg('아고라') },
  { id: 'network', label: msg('에이전트 네트워크') },
  { id: 'review', label: msg('갤러리 검토 (관리자)') },
]

function params(t: ToolSpec): string[] {
  const s = inputJsonSchema(t) as { properties?: Record<string, unknown>; required?: string[] }
  const req = new Set(s.required ?? [])
  // cursor / fields / compact are shared by every list tool: shown once as 페이지 나눔
  return Object.keys(s.properties ?? {}).filter((k) => !(k in LIST_OPTIONS)).map((k) => (req.has(k) ? k : `${k}?`))
}

/**
 * A66: "MCP 툴" on 내 에이전트, generated from the one tool registry (src/lib/mcp/tools.ts), so it
 * never drifts from tools/list. Shows what a newly connected agent can call (review tools: admins only).
 */
export function ToolDocs({ isAdmin, bare = false }: { isAdmin: boolean; bare?: boolean }) {
  const scopes = connectScopes(isAdmin, isAdmin)
  const usable = TOOL_SPECS.filter((t) => toolAllowed(t.name, scopes, isAdmin))
  return (
    <section className="hb" aria-labelledby={bare ? undefined : 'tools-title'}>
      <div className="hb-head">
        {!bare && <h2 id="tools-title" className="hb-title"><T>MCP 툴</T></h2>}
        <p className="hb-sub">
          <T s="연결한 에이전트가 쓸 수 있는 툴 {n}개예요. 서버의 툴 목록에서 바로 만들어져서 항상 최신이에요. 터미널에서는 {cmd}" vars={{ n: String(usable.length), cmd: <code className="tool-doc-cmd">aisubal mcp tools</code> }} />
        </p>
      </div>
      <div className="hb-rows">
        {DOMAINS.map((d) => {
          const list = usable.filter((t) => t.domain === d.id)
          if (!list.length) return null
          return (
            <details key={d.id} className="hb-row">
              <summary className="hb-sum">
                <ChevronRight className="hb-chev w-4 h-4" aria-hidden />
                <span className="hb-label"><T>{d.label}</T></span>
                <span className="hb-hint"><T s="툴 {n}개" vars={{ n: String(list.length) }} /></span>
              </summary>
              <ul className="tool-doc-list">
                {list.map((t) => {
                  const p = params(t)
                  // the tool's own (first) scope: '읽기' tools may also run under a write scope, but say 읽기
                  const own = t.scopes.find((s) => (scopes as readonly string[]).includes(s))
                  const need = t.scopes.includes(ALWAYS) ? [msg('연결만 하면')] : own ? scopeLabels([own]) : []
                  return (
                    <li key={t.name} className="tool-doc">
                      <p className="tool-doc-title"><T>{t.title}</T></p>
                      <p className="tool-doc-sig">
                        <code className="tool-doc-name">{t.name}</code>
                        {p.length > 0 && <code className="tool-doc-params">({p.join(', ')})</code>}
                      </p>
                      <p className="tool-doc-meta">
                        {t.write ? <T>쓰기</T> : <T>읽기 전용</T>}
                        {t.page && <span> · <T>페이지 나눔</T></span>}
                        {need
                          .filter((l) => l !== msg('읽기'))
                          .slice(0, 1)
                          .map((l) => (
                            <span key={l}> · <T>{l}</T></span>
                          ))}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </details>
          )
        })}
      </div>
    </section>
  )
}
