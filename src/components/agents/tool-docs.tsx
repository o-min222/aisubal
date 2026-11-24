import { ChevronRight } from 'lucide-react'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { connectScopes, scopeLabels } from '@/lib/agent-connect'
import { ALWAYS } from '@/lib/mcp/registry'
import { TOOL_DOMAINS, catalogPrompts, catalogResources, sheetTools, toolParams } from '@/lib/mcp/catalog'

/**
 * A66: "MCP 툴" on 내 에이전트, generated from the one tool registry (src/lib/mcp/tools.ts), so it
 * never drifts from tools/list. Shows what a newly connected agent can call, plus the member tools that need
 * an extra permission. A81: admin (review) tools exist only in the admin view.
 */
export function ToolDocs({ isAdmin, bare = false }: { isAdmin: boolean; bare?: boolean }) {
  const scopes = connectScopes(isAdmin, isAdmin)
  const { usable, extra, admin } = sheetTools(isAdmin)
  const shown = [...usable, ...extra]
  const isExtra = new Set(extra.map((t) => t.name))
  const prompts = catalogPrompts()
  const resources = catalogResources({ scopes, isAdmin })
  return (
    <section className="hb" aria-labelledby={bare ? undefined : 'tools-title'}>
      <div className="hb-head">
        {!bare && <h2 id="tools-title" className="hb-title"><T>MCP 툴</T></h2>}
        <p className="hb-sub">
          {admin.length > 0 ? (
            <T s="연결한 에이전트가 기본으로 쓸 수 있는 툴 {n}개예요 (관리자 전용 {a}개 포함)." vars={{ n: String(usable.length), a: String(admin.length) }} />
          ) : (
            <T s="연결한 에이전트가 기본으로 쓸 수 있는 툴 {n}개예요." vars={{ n: String(usable.length) }} />
          )}{' '}
          {extra.length > 0 && <><T s="추가 권한이 있어야 쓰는 툴 {n}개도 함께 보여요." vars={{ n: String(extra.length) }} />{' '}</>}
          <T s="서버의 툴 목록에서 바로 만들어져서 항상 최신이에요. 터미널에서는 {cmd}" vars={{ cmd: <code className="tool-doc-cmd">aisubal mcp tools</code> }} />
        </p>
      </div>
      <div className="hb-rows">
        {TOOL_DOMAINS.map((d) => {
          const list = shown.filter((t) => t.domain === d.id)
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
                  const p = toolParams(t)
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
                        {isExtra.has(t.name) && <span> · <T>추가 권한 필요</T></span>}
                        {!isExtra.has(t.name) && need
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
        {/* A80: prompts and resources come from the same catalog as prompts/list and resources/list */}
        <details className="hb-row">
          <summary className="hb-sum">
            <ChevronRight className="hb-chev w-4 h-4" aria-hidden />
            <span className="hb-label"><T>MCP 프롬프트</T></span>
            <span className="hb-hint"><T s="{n}개" vars={{ n: String(prompts.length) }} /></span>
          </summary>
          <ul className="tool-doc-list">
            {prompts.map((p) => (
              <li key={p.name} className="tool-doc">
                <p className="tool-doc-title"><T>{p.title}</T></p>
                <p className="tool-doc-sig"><code className="tool-doc-name">{p.name}</code><code className="tool-doc-params">(lang?)</code></p>
              </li>
            ))}
          </ul>
        </details>
        <details className="hb-row">
          <summary className="hb-sum">
            <ChevronRight className="hb-chev w-4 h-4" aria-hidden />
            <span className="hb-label"><T>MCP 리소스</T></span>
            <span className="hb-hint"><T s="{n}개" vars={{ n: String(resources.length) }} /></span>
          </summary>
          <ul className="tool-doc-list">
            {resources.map((r) => (
              <li key={r.uri} className="tool-doc">
                <p className="tool-doc-title"><T>{r.title}</T></p>
                <p className="tool-doc-sig"><code className="tool-doc-name">{r.uri}</code></p>
                <p className="tool-doc-meta"><T>읽기 전용</T></p>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  )
}
