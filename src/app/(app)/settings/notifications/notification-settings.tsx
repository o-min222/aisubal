'use client'

import { useSyncExternalStore } from 'react'

const OPTIONS = [
  { id: 'replies', label: '내 글에 답글', hint: '피드 · 익명 게시판' },
  { id: 'likes', label: '좋아요 요약', hint: '하루 한 번 모아서' },
  { id: 'invites', label: '초대한 멤버 가입', hint: '내 초대 코드가 쓰였을 때' },
  { id: 'tools', label: '내가 쓰는 툴 소식', hint: '리뷰 · AI 평가 · 런치 업데이트' },
  { id: 'meetups', label: '밋업', hint: '신청 결과 · 리마인더' },
] as const

const KEY = 'aisubal:notify'

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

export function NotificationSettings() {
  // Stored on this device until notification delivery ships.
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) || '{}', () => '{}')
  let prefs: Record<string, boolean> = {}
  try {
    prefs = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  function toggle(id: string) {
    localStorage.setItem(KEY, JSON.stringify({ ...prefs, [id]: !(prefs[id] ?? true) }))
    listeners.forEach((l) => l())
  }
  return (
    <section className="card divide-y divide-[#eee]">
      {OPTIONS.map((o) => {
        const on = prefs[o.id] ?? true
        return (
          <label key={o.id} className="p-4 flex items-center gap-3 min-h-[60px] cursor-pointer">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[#333]">{o.label}</span>
              <span className="block text-xs text-[#888]">{o.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(o.id)}
              className={`switch ${on ? 'on' : ''}`}
            >
              <span />
            </button>
          </label>
        )
      })}
    </section>
  )
}
