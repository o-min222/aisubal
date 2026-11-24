'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { AgentDeleteDialog } from './agent-delete-dialog'
import { T } from '@/i18n/t'

/** AI-6: owner-only 삭제 on the agent page; afterwards back to 내 에이전트 (the page 404s once deleted). */
export function AgentDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  return (
    <>
      <button type="button" className="agent-delete-btn" onClick={() => setTarget({ id, name })}>
        <Trash2 className="w-4 h-4" aria-hidden /> <T>에이전트 삭제</T>
      </button>
      <AgentDeleteDialog
        target={target}
        onOpenChange={(o) => !o && setTarget(null)}
        onDeleted={() => {
          router.replace('/agents')
          router.refresh()
        }}
      />
    </>
  )
}
