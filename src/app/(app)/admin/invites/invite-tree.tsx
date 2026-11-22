'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'

export type TreeNode = {
  id: string
  displayName: string
  handle?: string | null
  /** admin-only private data */
  realName?: string | null
  email: string
  joinedAt: string
  isBanned: boolean
  invitedCount: number
  children: TreeNode[]
}

export function InviteTree({ node, level = 0 }: { node: TreeNode; level?: number }) {
  const [open, setOpen] = useState(true)
  const has = node.children.length > 0
  return (
    <div>
      <div className="flex items-center gap-1 min-h-[44px]" style={{ paddingLeft: level * 18 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!has}
          className="w-8 h-8 inline-flex items-center justify-center text-[#888] disabled:opacity-0"
          aria-label={open ? '접기' : '펼치기'}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {node.id === 'root' ? (
          <span className="font-medium text-[#111]">{node.displayName}</span>
        ) : (
          <Link href={`/members/${node.id}`} className={`font-medium hover:underline ${node.isBanned ? 'text-red-600 line-through' : 'text-[#111]'}`}>
            {node.displayName}
          </Link>
        )}
        {node.handle && <span className="text-xs text-[#666] ml-1">@{node.handle}</span>}
        {(node.realName || node.email) && (
          <span className="text-xs text-[#888] truncate ml-1" title="관리자에게만 보여요">
            {[node.realName, node.email].filter(Boolean).join(' · ')}
          </span>
        )}
        {node.invitedCount > 0 && <span className="ml-auto text-xs text-[#888] whitespace-nowrap">초대 {node.invitedCount}</span>}
      </div>
      {open && node.children.map((c) => <InviteTree key={c.id} node={c} level={level + 1} />)}
    </div>
  )
}
