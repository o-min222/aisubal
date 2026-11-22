'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'

type U = { id: string; name: string; email: string; posts: number; isAdmin: boolean; isBanned: boolean }

export function UsersAdmin({ initial, meId }: { initial: U[]; meId: string }) {
  const [users, setUsers] = useState(initial)
  const [q, setQ] = useState('')
  const shown = users.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))

  async function setBan(u: U, ban: boolean) {
    if (ban && !confirm(`${u.name}님을 차단할까요?`)) return
    const res = await fetch(`/api/admin/users/${u.id}/ban`, {
      method: ban ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: ban ? JSON.stringify({}) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || '처리하지 못했어요.')
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isBanned: ban } : x)))
    toast.success(ban ? '차단했어요.' : '차단을 풀었어요.')
  }

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·이메일 검색" aria-label="유저 검색" className="input" />
      <ul className="card divide-y divide-[#eee]">
        {shown.map((u) => (
          <li key={u.id} className="p-3 flex items-center gap-3">
            <Link href={`/members/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1">
              <UserAvatar id={u.id} name={u.name} size="sm" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-[#111] truncate">{u.name}</span>
                  {u.isAdmin && <span className="badge bg-purple-100 text-purple-700">관리자</span>}
                  {u.isBanned && <span className="badge bg-red-100 text-red-700">차단됨</span>}
                </span>
                <span className="block text-xs text-[#888] truncate">
                  {u.email} · 게시물 {u.posts}
                </span>
              </span>
            </Link>
            {!u.isAdmin && u.id !== meId && (
              <button
                type="button"
                onClick={() => setBan(u, !u.isBanned)}
                className="btn btn-secondary btn-sm min-h-[40px]"
                aria-label={u.isBanned ? `${u.name} 차단 해제` : `${u.name} 차단`}
              >
                {u.isBanned ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                <span className="only-desktop">{u.isBanned ? '해제' : '차단'}</span>
              </button>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="p-6 text-center text-sm text-[#888]">해당하는 유저가 없어요.</li>}
      </ul>
    </div>
  )
}
