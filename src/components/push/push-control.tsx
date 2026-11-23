'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { PushPlan } from '@/lib/push-rules'
import { currentPushPlan, disablePush, enablePush, isPushOn, sendTestPush, type EnableResult } from '@/lib/push-client'
import { msg } from '@/i18n/translate'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

const HINT: Record<PushPlan, string> = {
  'install-first': msg('iPhone·iPad에서는 홈 화면에 추가한 앱에서 알림을 켤 수 있어요.'),
  unsupported: msg('이 브라우저는 푸시 알림을 지원하지 않아요.'),
  denied: msg('알림이 차단돼 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'),
  auto: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
  ask: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
  granted: msg('알림 설정에서 켠 알림이 이 기기로도 와요.'),
}
const RESULT: Partial<Record<EnableResult, string>> = {
  denied: msg('알림이 차단돼 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'),
  error: msg('알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.'),
  unsupported: msg('이 브라우저는 푸시 알림을 지원하지 않아요.'),
}

function usePush(autoAsk: boolean) {
  const [plan, setPlan] = useState<PushPlan | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const asked = useRef(false)
  async function enable(quiet = false) {
    setBusy(true)
    const r = await enablePush()
    setBusy(false)
    setPlan(currentPushPlan())
    setOn(r === 'on')
    if (r === 'on' && !quiet) toast.success(tn('이 기기에서 알림을 받아요'))
    else if (RESULT[r] && !quiet) toast.error(tn(RESULT[r]!))
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
    return () => {
      live = false
    }
  }, [autoAsk])
  return { plan, on, busy, enable, setOn, setBusy }
}

/** Onboarding (홈 화면에 추가 step): one compact line under the install guide. */
export function PushStep() {
  const { plan, on, busy, enable } = usePush(true)
  if (!plan) return null
  const can = plan === 'auto' || plan === 'ask' || plan === 'granted'
  return (
    <div className="push-step">
      <span className="push-step-icon" aria-hidden>{on ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}</span>
      <span className="min-w-0 flex-1 text-[13px] text-n-555" style={{ wordBreak: 'keep-all' }}>
        {on ? <T>알림이 켜졌어요. 새 소식이 이 기기로 와요.</T> : can ? <T>새 댓글·친구 신청을 이 기기로 받아요.</T> : <T>{HINT[plan]}</T>}
      </span>
      {on ? <Check className="w-4 h-4 text-c-2f9e66 flex-shrink-0" aria-label={tx('켜짐')} /> : can && (
        <button type="button" className="filter-chip flex-shrink-0" disabled={busy} onClick={() => void enable()}><T>알림 켜기</T></button>
      )}
    </div>
  )
}

/** Settings: the 'push on this device' switch, and a test button once it's on. */
export function PushSettings() {
  const { plan, on, busy, enable, setOn, setBusy } = usePush(false)
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
  const can = plan === 'auto' || plan === 'ask' || plan === 'granted'
  return (
    <section className="card">
      <div className="p-4 flex items-center gap-3 min-h-[60px]">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-n-333"><T>이 기기에서 푸시 받기</T></span>
          <span className="block text-xs text-n-888" style={{ wordBreak: 'keep-all' }}>{plan ? <T>{HINT[plan]}</T> : '\u00a0'}</span>
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
