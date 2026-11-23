'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ExternalLink, PackageCheck, Search } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { RelativeTime } from '@/components/relative-time'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { INSTALL_ENVS, SNIPPET_MAX, envLabel, filterQueue, snippetsFromMcp, type InstallEnv, type InstallFilter, type InstallQueueItem } from '@/lib/install-admin'
import type { Snippets } from '@/lib/install-catalog'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

const host = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return u
  }
}

export function InstallsAdmin({ items: initial, filter }: { items: InstallQueueItem[]; filter: InstallFilter }) {
  const [items, setItems] = useState(initial)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const shown = useMemo(() => filterQueue(items, 'all', q), [items, q])
  const current = items.find((i) => i.id === openId) ?? null

  return (
    <>
      <label className="inst-search">
        <Search className="w-4 h-4 text-n-888" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('이름으로 찾기')} aria-label={tx('이름으로 찾기')} />
      </label>
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-n-888">
          <PackageCheck className="w-9 h-9 mx-auto mb-2 text-n-ddd" />
          {q ? <T>찾는 항목이 없어요.</T> : filter === 'todo' ? <T>확인할 설치 명령이 없어요.</T> : <T>항목이 없어요.</T>}
        </div>
      ) : (
        <ul className="sub-list">
          {shown.map((i) => {
            const envs = INSTALL_ENVS.filter((e) => i.snippets[e])
            return (
              <li key={i.id}>
                <button type="button" className="inst-row" onClick={() => setOpenId(i.id)}>
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className={`crow-chip ${i.verified ? 'inst-ok' : 'inst-todo'}`}>{i.verified ? <T>확인됨</T> : <T>확인 필요</T>}</span>
                    <span className="font-semibold text-[15px] text-n-111 truncate max-w-full">{i.name}</span>
                    {i.catalog && !i.verified && <span className="crow-chip"><T>카탈로그 있음</T></span>}
                  </div>
                  <div className="crow-meta">
                    <span>{i.sourceRepo ?? host(i.officialUrl)}</span>
                    {envs.length > 0 && <span><T s="환경 {n}개" vars={{ n: envs.length }} /></span>}
                    <span><T s="설치 {n}" vars={{ n: i.installCount }} /></span>
                    {i.verified && i.verifiedAt && (
                      <span>
                        {i.verifiedBy ? `${i.verifiedBy} · ` : ''}
                        <RelativeTime date={i.verifiedAt} />
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <AdaptiveSheet open={Boolean(current)} onOpenChange={(o) => !o && setOpenId(null)} title={current?.name ?? tx('설치 확인')} className="inst-sheet">
        {current && (
          <InstallEditor
            key={current.id}
            item={current}
            onSaved={(snippets, verified) => {
              setItems((l) => l.map((x) => (x.id === current.id ? { ...x, snippets, verified, verifiedAt: verified ? new Date().toISOString() : null } : x)))
              setOpenId(null)
            }}
          />
        )}
      </AdaptiveSheet>
    </>
  )
}

function InstallEditor({ item, onSaved }: { item: InstallQueueItem; onSaved: (s: Snippets, verified: boolean) => void }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Snippets>(() => ({ ...(item.verified ? item.snippets : item.catalog ?? item.snippets) }))
  const firstEnv = INSTALL_ENVS.find((e) => draft[e]) ?? 'generic'
  const [env, setEnv] = useState<InstallEnv>(firstEnv)
  const [fill, setFill] = useState<null | 'npx' | 'remote'>(null)
  const [fillValue, setFillValue] = useState('')
  const [busy, setBusy] = useState(false)
  const filled = INSTALL_ENVS.filter((e) => draft[e]?.trim())

  async function save(snippets: Snippets) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/installs/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippets }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tn('저장하지 못했어요.'))
      toast.success(d.verified ? tn('설치 명령을 확인했어요. 이제 공개돼요.') : tn('확인을 취소했어요. 공식 링크만 보여요.'))
      onSaved(d.snippets ?? {}, Boolean(d.verified))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  function applyFill() {
    if (!fill) return
    const s = snippetsFromMcp(fill, fillValue, item.slug)
    if (!s) return toast.error(fill === 'npx' ? tn('npm 패키지 이름을 확인해 주세요.') : tn('https:// 로 시작하는 주소를 넣어 주세요.'))
    setDraft(s)
    setEnv(INSTALL_ENVS.find((e) => s[e]) ?? 'generic')
    setFill(null)
    setFillValue('')
  }

  return (
    <div className="inst-edit">
      <div className="crow-meta">
        <a href={item.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-link">
          <ExternalLink className="w-3 h-3" /> {host(item.officialUrl)}
        </a>
        {item.sourceRepo && <span>{item.sourceRepo}</span>}
        {item.license && <span>{item.license}</span>}
        {item.lastCommitAt && (
          <span>
            <T>최근 커밋</T> <RelativeTime date={item.lastCommitAt} />
          </span>
        )}
      </div>

      <div className="inst-envs" role="tablist" aria-label={tx('환경')}>
        {INSTALL_ENVS.map((e) => (
          <button key={e} type="button" role="tab" aria-selected={env === e} className="inst-env" onClick={() => setEnv(e)}>
            {e === 'generic' ? <T>공통</T> : envLabel(e)}
            {draft[e]?.trim() ? <span className="inst-dot" aria-label={tx('입력됨')} /> : null}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[12.5px] text-n-777">
            {env === 'generic' ? <T>다른 환경에 명령이 없을 때 보여줘요.</T> : <T s="{env}에서 쓰는 명령·설정" vars={{ env: envLabel(env) }} />}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="inst-fill-btn">
              <T>채우기</T> <ChevronDown className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[260px]">
              {item.catalog && (
                <DropdownMenuItem onClick={() => { setDraft({ ...item.catalog! }); setEnv(INSTALL_ENVS.find((e) => item.catalog![e]) ?? 'generic') }}>
                  <T>검증 카탈로그 값 불러오기</T>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setFill('npx')}><T>npm 패키지로 모든 환경 채우기…</T></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFill('remote')}><T>원격 MCP 주소로 모든 환경 채우기…</T></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDraft((d) => { const n = { ...d }; delete n[env]; return n })}><T>이 환경 비우기</T></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {fill && (
          <form className="inst-fill" onSubmit={(e) => { e.preventDefault(); applyFill() }}>
            <input
              className="input"
              autoFocus
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder={fill === 'npx' ? '@scope/mcp-server' : 'https://mcp.example.com/mcp'}
              aria-label={fill === 'npx' ? tx('npm 패키지') : tx('원격 MCP 주소')}
            />
            <button type="submit" className="btn btn-secondary btn-sm min-h-[40px]"><T>채우기</T></button>
          </form>
        )}
        <textarea
          className="input inst-code"
          rows={7}
          spellCheck={false}
          value={draft[env] ?? ''}
          maxLength={SNIPPET_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, [env]: e.target.value }))}
          placeholder={tx('공식 README에 적힌 그대로 붙여 넣어 주세요')}
          aria-label={tx('설치 명령')}
        />
        <p className="text-[12px] text-n-888 mt-1.5">
          <T>패키지 이름을 추측하지 마세요. 비슷한 이름의 가짜 패키지(타이포스쿼팅)일 수 있어요.</T>
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        {item.verified ? (
          <button type="button" className="text-[13px] text-n-777 hover:text-n-111" disabled={busy} onClick={() => confirm(tn('확인을 취소할까요? 공식 링크만 보이게 돼요.')) && save({})}>
            <T>확인 취소</T>
          </button>
        ) : (
          <span className="text-[12.5px] text-n-888"><T s="환경 {n}개 입력됨" vars={{ n: filled.length }} /></span>
        )}
        <button type="button" className="btn btn-primary btn-sm rounded-full min-h-[40px]" disabled={busy || filled.length === 0} onClick={() => save(draft)}>
          {item.verified ? <T>저장</T> : <T>확인하고 공개</T>}
        </button>
      </div>
    </div>
  )
}
