'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

/** Search box that writes ?q= and keeps the other filters. */
export function ToolSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(initial)

  function go(next: string) {
    const sp = new URLSearchParams(params.toString())
    if (next.trim()) sp.set('q', next.trim())
    else sp.delete('q')
    router.push(`/tools${sp.toString() ? `?${sp}` : ''}`)
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        go(q)
      }}
      className="relative"
    >
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="툴 이름, 태그, 한 줄 소개"
        aria-label="툴 검색"
        enterKeyHint="search"
        className="w-full h-11 pl-9 pr-10 rounded-full border border-[#e3e3e3] bg-white text-[15px]"
      />
      {q && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            setQ('')
            go('')
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center text-[#888]"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </form>
  )
}
