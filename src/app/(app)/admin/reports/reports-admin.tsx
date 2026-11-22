'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { toast } from 'sonner'
import { RelativeTime } from '@/components/relative-time'

type R = { id: string; postTitle: string; reporter: string; reason: string; createdAt: string }

export function ReportsAdmin({ initial }: { initial: R[] }) {
  const [reports, setReports] = useState(initial)
  async function resolve(id: string, action: 'ignore' | 'delete') {
    if (action === 'delete' && !confirm('게시물을 삭제할까요?')) return
    const res = await fetch(`/api/admin/reports?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || '처리하지 못했어요.')
    setReports((l) => l.filter((r) => r.id !== id))
    toast.success(action === 'ignore' ? '신고를 무시했어요.' : '게시물을 삭제했어요.')
  }
  if (reports.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Flag className="w-10 h-10 mx-auto mb-3 text-[#ddd]" />
        <p className="text-sm text-[#888]">처리할 신고가 없어요.</p>
      </div>
    )
  }
  return (
    <ul className="card divide-y divide-[#eee]">
      {reports.map((r) => (
        <li key={r.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-[#111]">{r.postTitle}</div>
            <div className="text-xs text-[#888] mt-1">
              신고자 {r.reporter} · <RelativeTime date={r.createdAt} />
            </div>
            <div className="text-sm text-[#555] mt-1">사유: {r.reason}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => resolve(r.id, 'ignore')} className="btn btn-secondary btn-sm min-h-[40px]">
              무시
            </button>
            <button type="button" onClick={() => resolve(r.id, 'delete')} className="btn btn-sm min-h-[40px] bg-red-600 text-white hover:bg-red-700">
              삭제
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
