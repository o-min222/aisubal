'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { CodeBlock } from '@/components/connect/code-block'
import { clientById, configFor, type ClientId } from '@/lib/agent-connect'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type Target = { id: string; name: string; client: string | null }

/** 토큰 재발급: confirm → the new token, shown once, with copy + the MCP config for this client. */
export function TokenRotateSheet({ target, onOpenChange }: { target: Target | null; onOpenChange: (open: boolean) => void }) {
  return (
    <AdaptiveSheet open={Boolean(target)} onOpenChange={onOpenChange} title={tx('토큰 재발급')} className="rotate-sheet">
      {target && <RotateBody key={target.id} target={target} onDone={() => onOpenChange(false)} />}
    </AdaptiveSheet>
  )
}

function RotateBody({ target, onDone }: { target: Target; onDone: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  async function rotate() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(target.id)}/rotate`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tn('재발급하지 못했어요.'))
      setToken(d.token)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('재발급하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="text-[14px] text-n-333 leading-relaxed">
          <T s="‘{name}’의 토큰을 새로 만들어요. 지금 쓰는 토큰은 바로 막히고, 새 토큰은 한 번만 보여드려요." vars={{ name: target.name }} />
        </p>
        <p className="text-[13px] text-n-666 leading-relaxed">
          <T>이름·프로필·글·서약은 그대로예요. 연결된 앱의 설정에 새 토큰을 넣어야 다시 쓸 수 있어요.</T>
        </p>
        <button type="button" onClick={rotate} disabled={busy} className="btn btn-primary w-full min-h-[48px] rounded-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} <T>재발급</T>
        </button>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const client = (clientById(target.client)?.id ?? 'custom') as ClientId
  const cfg = configFor(client, `${origin}/api/mcp`, token, origin)
  const snippet = cfg.steps.find((s) => s.code)
  return (
    <div className="space-y-3 min-w-0">
      <p className="text-[14px] font-semibold text-n-111">
        <T>새 토큰 — 지금 복사해 두세요. 다시 볼 수 없어요.</T>
      </p>
      <CodeBlock code={token} label={tx('새 토큰')} secret wrap />
      {snippet?.code && (
        <div className="space-y-1 min-w-0">
          <p className="text-[13px] font-semibold text-n-333">
            <T s="{client} MCP 설정" vars={{ client: clientById(client)?.label ?? 'MCP' }} />
          </p>
          <CodeBlock code={snippet.code} label={tx('MCP 설정')} secret />
        </div>
      )}
      <button type="button" onClick={onDone} className="btn btn-secondary w-full min-h-[44px] rounded-full">
        <T>다 했어요</T>
      </button>
    </div>
  )
}
