'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { PushPlan } from '@/lib/push-rules'
import { currentPushPlan, disablePush, enablePush, isPushOn, sendTestPush, watchPushPermission, type EnableResult } from '@/lib/push-client'
import { msg } from '@/i18n/translate'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

const HINT: Record<PushPlan, string> = {
  'install-first': msg('iPhone·iPad에서는 홈 화면에 추가한 앱에서 알림을 켤 수 있어요.'),
  unsupported: msg('이 브라우저는 푸시 알림을 지원하지 않아요.'),
  denied: msg('알림이 차단돼 있어요. 주소창 왼쪽 사이트 정보(자물쇠) 아이콘 → 알림 → 허용으로 바꾼 뒤 다시 켜 주세요.'),
  auto: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
  ask: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
  granted: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
}
/** A50: one line saying why the switch didn't turn on, and what to do about it. */
const ISSUE: Partial<Record<EnableResult, string>> = {
  denied: msg('알림이 차단돼 있어요. 주소창 왼쪽 사이트 정보(자물쇠) 아이콘 → 알림 → 허용으로 바꾼 뒤 다시 켜 주세요.'),
  dismissed: msg('알림 권한을 받지 못했어요. 주소창의 종 또는 자물쇠 아이콘에서 알림을 허용한 뒤 다시 켜 주세요.'),
  private: msg('시크릿·InPrivate 창에서는 푸시를 받을 수 없어요. 일반 창에서 켜 주세요.'),
  push_service: msg('브라우저의 푸시 서비스에 연결하지 못했어요. Brave라면 설정에서 ‘Google 푸시 서비스 사용’을 켜 주세요.'),
  sw_timeout: msg('알림 준비가 끝나지 않았어요. 새로고침한 뒤 다시 켜 주세요.'),
  error: msg('알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.'),
  unsupported: msg('이 브라우저는 푸시 알림을 지원하지 않아요.'),
}

function usePush(autoAsk: boolean) {
  const [plan, setPlan] = useState<PushPlan | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<EnableResult | null>(null)
  const asked = useRef(false)
  async function enable(quiet = false) {
    setBusy(true)
    setIssue(null)
    const r = await enablePush()
    setBusy(false)
    setPlan(currentPushPlan())
    setOn(r === 'on')
    if (r === 'on') {
      if (!quiet) toast.success(tn('이 기기에서 알림을 받아요'))
    } else if (!quiet || r !== 'dismissed') setIssue(r)
  }
  useEffect(() => {
    let live = true
    const p = currentPushPlan()
    setPlan(p) // eslint-disable-line react-hooks/set-state-in-effect
    if (p === 'granted') void isPushOn().then((v) => live && setOn(v))
    // Android/desktop: ask as soon as the step shows (D1); iOS waits for a tap inside the installed app
    if (autoAsk && p === 'auto' && !asked.current) {
      asked.current = true
      void enable(true)
    }
    // unblocked (or blocked) in site settings → update without a reload
    const stop = typeof window !== 'undefined' && 'Notification' in window ? watchPushPermission(() => {
      if (!live) return
      const next = currentPushPlan()
      setPlan(next)
      if (next === 'granted') setIssue((i) => (i === 'denied' || i === 'dismissed' ? null : i))
    }) : () => {}
    return () => {
      live = false
      stop()
    }
  }, [autoAsk])
  return { plan, on, busy, issue, enable, setOn, setBusy }
}

/** Onboarding (홈 화면에 추가 step): one compact line under the install guide. */
export function PushStep() {
  const { plan, on, busy, issue, enable } = usePush(true)
  if (!plan) return null
  const can = plan === 'auto' || plan === 'ask' || plan === 'granted' || plan === 'denied'
  return (
    <div className="push-step">
      <span className="push-step-icon" aria-hidden>{on ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}</span>
      <span className="min-w-0 flex-1 text-[13px] text-n-555" style={{ wordBreak: 'keep-all' }}>
        {on ? <T>알림이 켜졌어요. 새 소식이 이 기기로 와요.</T> : issue && ISSUE[issue] ? <span className="push-issue"><T>{ISSUE[issue]!}</T></span> : plan === 'denied' || !can ? <T>{HINT[plan]}</T> : <T>새 댓글·친구 신청을 이 기기로 받아요.</T>}
      </span>
      {on ? <Check className="w-4 h-4 text-c-2f9e66 flex-shrink-0" aria-label={tx('켜짐')} /> : can && (
        <button type="button" className="filter-chip flex-shrink-0" disabled={busy} onClick={() => void enable()}><T>알림 켜기</T></button>
      )}
    </div>
  )
}

/** Settings: the 'push on this device' switch, and a test button once it's on. */
export function PushSettings() {
  const { plan, on, busy, issue, enable, setOn, setBusy } = usePush(false)
  const [testing, setTesting] = useState(false)
  async function toggle() {
    if (on) {
      setBusy(true)
      await disablePush()
      setBusy(false)
      setOn(false)
      toast.success(tn('이 기기의 푸시 알림을 껐어요'))
    } else void enable()
  }
  async function test() {
    setTesting(true)
    const r = await sendTestPush()
    setTesting(false)
    if (r === 'queued') toast.success(tn('테스트 알림을 보냈어요. 잠시 후 이 기기에 떠요.'))
    else if (r === 'rate_limited') toast.error(tn('잠시 후 다시 보내 주세요.'))
    else toast.error(tn('테스트 알림을 보내지 못했어요.'))
  }
  // 'denied' keeps the switch: a tap re-checks, so after unblocking in site settings it just works (A50)
  const can = plan === 'auto' || plan === 'ask' || plan === 'granted' || plan === 'denied'
  const problem = !on && issue && ISSUE[issue] ? ISSUE[issue]! : null
  return (
    <section className="card">
      <div className="p-4 flex items-center gap-3 min-h-[60px]">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-n-333"><T>이 기기에서 푸시 받기</T></span>
          {problem ? (
            <span className="block text-xs push-issue" role="status" style={{ wordBreak: 'keep-all' }}><T>{problem}</T></span>
          ) : (
            <span className="block text-xs text-n-888" style={{ wordBreak: 'keep-all' }}>{plan ? <T>{HINT[plan]}</T> : '\u00a0'}</span>
          )}
        </span>
        {can && (
          <button type="button" role="switch" aria-checked={on} aria-label={tx('이 기기에서 푸시 받기')} disabled={busy || !plan} onClick={toggle} className={`switch ${on ? 'on' : ''}`}>
            <span />
          </button>
        )}
      </div>
      {(on || plan === 'install-first') && (
        <div className="px-4 pb-3 -mt-1">
          {on ? (
            <button type="button" className="filter-chip" disabled={testing} onClick={test}><Send className="w-3.5 h-3.5" /> <T>테스트 알림 보내기</T></button>
          ) : (
            <Link href="/settings/app" className="filter-chip"><T>홈 화면에 추가하기</T></Link>
          )}
        </div>
      )}
    </section>
  )
}
