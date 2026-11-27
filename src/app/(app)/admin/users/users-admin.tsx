'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ban, BookOpen, MessageSquareText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'

import type { AdminUserRow as U } from '@/lib/data/admin'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

export function UsersAdmin({ initial, meId }: { initial: U[]; meId: string }) {
  const [users, setUsers] = useState(initial)
  const [q, setQ] = useState('')
  const shown = users.filter((u) => !q || `${u.name} ${u.handle ?? ''} ${u.realName ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  async function setBan(u: U, ban: boolean) {
    if (ban && !confirm(tn('{name}님을 차단할까요?', { name: u.name }))) return
    const res = await fetch(`/api/admin/users/${u.id}/ban`, {
      method: ban ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: ban ? JSON.stringify({}) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('처리하지 못했어요.'))
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isBanned: ban } : x)))
    toast.success(ban ? tn('차단했어요.') : tn('차단을 풀었어요.'))
  }

  // A105: 화면 피드백 testers (admins can always)
  async function setFeedback(u: U, on: boolean) {
    const res = await fetch(`/api/admin/users/${u.id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('처리하지 못했어요.'))
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, feedbackEnabled: Boolean(data.feedbackEnabled) } : x)))
    toast.success(data.feedbackEnabled ? tn('{name}님이 화면 피드백을 쓸 수 있어요.', { name: u.name }) : tn('{name}님의 화면 피드백을 껐어요.', { name: u.name }))
  }

  async function setWriter(u: U, on: boolean) {
    const res = await fetch(`/api/admin/users/${u.id}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('처리하지 못했어요.'))
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, articleWriter: Boolean(data.articleWriter) } : x)))
    toast.success(data.articleWriter ? tn('{name}님을 작가로 지정했어요.', { name: u.name }) : tn('{name}님의 작가 권한을 해제했어요.', { name: u.name }))
  }

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('닉네임·핸들·실명·이메일 검색')} aria-label={tx('유저 검색')} className="input" />
      <ul className="card divide-y divide-n-eee">
        {shown.map((u) => (
          <li key={u.id} className="p-3 flex items-center gap-3">
            <Link href={`/members/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1">
              <UserAvatar id={u.id} name={u.name} size="sm" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-n-111 truncate">{u.name}</span>
                  {u.isAdmin && <span className="badge bg-c-f3e8ff text-c-6b21a8"><T>관리자</T></span>}
                  {u.isBanned && <span className="badge bg-c-fdecec text-c-b42318"><T>차단됨</T></span>}
                  {u.feedbackEnabled && !u.isAdmin && <span className="badge bg-n-f3f3f3 text-n-555"><T>피드백</T></span>}
                  {u.articleWriter && !u.isAdmin && <span className="badge bg-n-f3f3f3 text-n-555"><T>작가</T></span>}
                </span>
                <span className="block text-xs text-n-888 truncate"><T s="{v} · 게시물 {posts}" vars={{ v: u.handle ? `@${u.handle}` : tx('핸들 미설정'), posts: u.posts }} /></span>
                <span className="block text-xs text-n-aaa truncate" title={tx('관리자에게만 보여요')}>
                  {[u.realName, u.email].filter(Boolean).join(' · ') || tx('비공개 정보 없음')}
                </span>
              </span>
            </Link>
            {!u.isAdmin && !u.isBanned && (
              <button
                type="button"
                onClick={() => setWriter(u, !u.articleWriter)}
                className={`btn btn-sm min-h-[40px] ${u.articleWriter ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={u.articleWriter}
                aria-label={u.articleWriter ? tx('{name} 작가 권한 끄기', { name: u.name }) : tx('{name} 작가 권한 켜기', { name: u.name })}
                title={tx('아티클을 발행할 수 있는 작가')}
              >
                <BookOpen className="w-4 h-4" />
                <span className="only-desktop"><T>작가</T></span>
              </button>
            )}
            {!u.isAdmin && !u.isBanned && (
              <button
                type="button"
                onClick={() => setFeedback(u, !u.feedbackEnabled)}
                className={`btn btn-sm min-h-[40px] ${u.feedbackEnabled ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={u.feedbackEnabled}
                aria-label={u.feedbackEnabled ? tx('{name} 화면 피드백 끄기', { name: u.name }) : tx('{name} 화면 피드백 켜기', { name: u.name })}
                title={tx('화면 피드백 테스터')}
              >
                <MessageSquareText className="w-4 h-4" />
                <span className="only-desktop"><T>피드백</T></span>
              </button>
            )}
            {!u.isAdmin && u.id !== meId && (
              <button
                type="button"
                onClick={() => setBan(u, !u.isBanned)}
                className="btn btn-secondary btn-sm min-h-[40px]"
                aria-label={u.isBanned ? tx('{name} 차단 해제', { name: u.name }) : tx('{name} 차단', { name: u.name })}
              >
                {u.isBanned ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                <span className="only-desktop">{u.isBanned ? <T>해제</T> : <T>차단</T>}</span>
              </button>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="p-6 text-center text-sm text-n-888"><T>해당하는 유저가 없어요.</T></li>}
      </ul>
    </div>
  )
}
