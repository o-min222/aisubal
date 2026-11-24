'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { ToolIcon } from '@/components/tools/tool-icon'
import { useDragSort } from '@/hooks/use-drag-sort'
import { moveItem } from '@/lib/profile-stack'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

export type MyTool = { id: string; name: string; iconUrl: string | null; href: string; typeLabel: string; users: number }

/**
 * '내가 쓰는 것' on a profile. The owner gets 순서 바꾸기 (A90): drag a card with the mouse, or
 * long-press then drag on touch (A94), or arrow keys on a focused card; 완료 saves the order
 * (tool_users.position, 0126), which every list follows.
 */
export function MyToolsList({ tools: initial, editable }: { tools: MyTool[]; editable: boolean }) {
  const router = useRouter()
  const [draft, setTools] = useState(initial)
  const [sorting, setSortingState] = useState(false)
  // the server list while viewing; a draft copy while sorting
  const tools = sorting ? draft : initial
  const setSorting = (on: boolean) => {
    if (on) setTools(initial)
    setSortingState(on)
  }
  const [busy, setBusy] = useState(false)
  const latest = useRef(tools)
  useEffect(() => { latest.current = tools }, [tools])
  const sort = useDragSort('my-tools', (from, to) => setTools((cur) => moveItem(cur, from, to)), () => {})

  async function done() {
    const changed = latest.current.some((t, i) => t.id !== initial[i]?.id)
    if (!changed) return setSorting(false)
    setBusy(true)
    const res = await fetch('/api/profile/tools-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: latest.current.map((t) => t.id) }) }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return toast.error(tn('순서를 저장하지 못했어요.'))
    toast.success(tn('순서를 저장했어요'))
    setSorting(false)
    router.refresh()
  }

  const meta = (t: MyTool) => (
    <span className="min-w-0">
      <span className="block text-sm font-medium text-n-111 truncate">{t.name}</span>
      <span className="block text-[11.5px] text-n-888 truncate">
        <T>{t.typeLabel}</T>
        {t.users > 1 ? <> · <T s="{n}명이 써요" vars={{ n: t.users }} /></> : ''}
      </span>
    </span>
  )

  return (
    <>
      {editable && tools.length > 1 && (
        <div className="my-tools-bar">
          {sorting ? (
            <>
              <span className="text-[12px] text-n-888"><T>끌어서 옮겨요 · 터치는 길게 누른 뒤 끌어요</T></span>
              <button type="button" className="btn btn-primary btn-sm rounded-full min-h-[32px]" onClick={() => void done()} disabled={busy}>
                {busy ? <T>저장 중…</T> : <T>완료</T>}
              </button>
            </>
          ) : (
            <button type="button" className="text-xs text-link min-h-[32px]" onClick={() => setSorting(true)}><T>순서 바꾸기</T></button>
          )}
        </div>
      )}
      <ul className={`profile-tools${sorting ? ' is-sorting-list' : ''}`} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))' }}>
        {tools.map((t, i) => (
          <li key={t.id} className={`min-w-0${sorting && sort.dragIdx === i ? ' pe-dragging' : ''}`} {...(sorting ? sort.item(i) : {})}>
            {sorting ? (
              <div className="profile-tool my-tool-sort min-w-0" tabIndex={0} data-sort-focus aria-keyshortcuts="ArrowUp ArrowDown">
                <span className="my-tool-grip" aria-hidden><GripVertical className="w-4 h-4" /></span>
                <ToolIcon name={t.name} iconUrl={t.iconUrl} dim="w-9 h-9" />
                {meta(t)}
              </div>
            ) : (
              <Link href={t.href} className="profile-tool min-w-0">
                <ToolIcon name={t.name} iconUrl={t.iconUrl} dim="w-9 h-9" />
                {meta(t)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
