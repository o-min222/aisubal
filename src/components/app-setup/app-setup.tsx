'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Check, Copy, Download, MonitorSmartphone, RefreshCw, Share, SquarePlus, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { detectPlatform, handoffUrl, type AppPlatform } from '@/lib/handoff-rules'
import { APP_SETUP_KEY, isStandalone } from '@/lib/pwa-install'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { PushStep } from '@/components/push/push-control'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const noSubscribe = () => () => {}
const clientPlatform = () => detectPlatform(navigator.userAgent, { standalone: isStandalone(), touch: navigator.maxTouchPoints > 1 })

const remember = (v: 'done' | 'later') => {
  try { localStorage.setItem(APP_SETUP_KEY, v) } catch {}
}

/**
 * 홈 화면에 추가 (D1): Android/Chrome one-tap install, iOS 공유 → 홈 화면에 추가, and on a computer a QR
 * that signs this member in on their phone and opens this same step there.
 */
export function AppSetup({ next, mode }: { next: string; mode: 'onboarding' | 'settings' }) {
  const router = useRouter()
  // client-only (UA, display-mode); null during SSR so the card renders as a placeholder first
  const platform = useSyncExternalStore<AppPlatform | null>(noSubscribe, clientPlatform, () => null)
  const finish = (v: 'done' | 'later') => {
    remember(v)
    if (mode === 'onboarding' || v === 'later') router.replace(next)
  }
  if (!platform) return <div className="card app-setup" aria-busy="true" style={{ minHeight: 220 }} />
  return (
    <section className="card app-setup">
      {platform === 'standalone' ? (
        <Done title={tx('이미 앱으로 쓰고 있어요')} body={tx('홈 화면의 AI쓰발 아이콘으로 열면 돼요.')} />
      ) : platform === 'desktop' ? (
        <PhoneHandoff onDone={() => finish('done')} />
      ) : platform === 'ios' ? (
        <IosGuide />
      ) : (
        <AndroidInstall onInstalled={() => finish('done')} />
      )}
      <PushStep />
      <div className="app-setup-foot">
        {platform === 'standalone' || mode === 'settings' ? (
          mode === 'onboarding' && <button type="button" className="btn btn-primary w-full min-h-[44px]" onClick={() => finish('done')}><T>계속</T></button>
        ) : (
          <>
            {platform !== 'desktop' && <button type="button" className="btn btn-primary w-full min-h-[44px]" onClick={() => finish('done')}><T>추가했어요</T></button>}
            <button type="button" className="app-setup-later" onClick={() => finish('later')}><T>나중에 할게요</T></button>
          </>
        )}
      </div>
    </section>
  )
}

function Head({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="app-setup-head">
      <span className="app-setup-icon" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold text-n-111">{title}</h2>
        <p className="text-[13.5px] text-n-666 mt-0.5" style={{ wordBreak: 'keep-all' }}>{body}</p>
      </div>
    </div>
  )
}

function Done({ title, body }: { title: string; body: string }) {
  return <Head icon={<Check className="w-5 h-5" />} title={title} body={body} />
}

function AndroidInstall({ onInstalled }: { onInstalled: () => void }) {
  const { mode, prompt } = usePwaInstall()
  async function install() {
    if ((await prompt()) === 'accepted') onInstalled()
  }
  return (
    <>
      <Head icon={<Smartphone className="w-5 h-5" />} title={tx('홈 화면에 추가하기')} body={tx('앱처럼 전체 화면으로 열리고, 알림과 글쓰기가 한 번에 닿아요.')} />
      {mode === 'prompt' ? (
        <button type="button" className="btn btn-primary w-full min-h-[48px] mt-4" onClick={install}>
          <Download className="w-4 h-4" /> <T>홈 화면에 추가</T>
        </button>
      ) : (
        <ol className="app-setup-steps">
          <li><span className="app-setup-n">1</span><T>브라우저 메뉴(⋮)를 열어요</T></li>
          <li><span className="app-setup-n">2</span><T>‘앱 설치’ 또는 ‘홈 화면에 추가’를 눌러요</T></li>
        </ol>
      )}
    </>
  )
}

function IosGuide() {
  return (
    <>
      <Head icon={<Smartphone className="w-5 h-5" />} title={tx('홈 화면에 추가하기')} body={tx('Safari에서 세 번만 누르면 앱처럼 열려요.')} />
      <ol className="app-setup-steps">
        <li><span className="app-setup-n">1</span><span><T s="아래쪽 공유 버튼 {icon} 을 눌러요" vars={{ icon: <Share className="w-4 h-4 inline -mt-0.5" aria-label={tx('공유')} /> }} /></span></li>
        <li><span className="app-setup-n">2</span><span><T s="‘홈 화면에 추가’ {icon} 를 골라요" vars={{ icon: <SquarePlus className="w-4 h-4 inline -mt-0.5" aria-hidden /> }} /></span></li>
        <li><span className="app-setup-n">3</span><T>오른쪽 위 ‘추가’를 눌러요</T></li>
      </ol>
    </>
  )
}

type Handoff = { id: string; url: string; svg: string; expiresAt: number; oneTap: boolean }

function PhoneHandoff({ onDone }: { onDone: () => void }) {
  const [h, setH] = useState<Handoff | null>(null)
  const [state, setState] = useState<'loading' | 'pending' | 'completed' | 'expired' | 'limited' | 'error'>('loading')
  const [left, setLeft] = useState(0)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  async function make() {
    setState('loading')
    const r = await fetch('/api/handoff', { method: 'POST' }).catch(() => null)
    const d = r?.ok ? ((await r.json()) as { id: string; token: string; expiresAt: string; oneTap?: boolean }) : null
    if (!d) return setState(r?.status === 429 ? 'limited' : 'error')
    const url = handoffUrl(window.location.origin, d.token)
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
    setH({ id: d.id, url, svg, expiresAt: Date.parse(d.expiresAt), oneTap: d.oneTap === true })
    setState('pending')
  }
  useEffect(() => {
    void make() // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  // poll until the phone signs in; count down the expiry
  useEffect(() => {
    if (!h || state !== 'pending') return
    const tick = setInterval(() => setLeft(Math.max(0, Math.round((h.expiresAt - Date.now()) / 1000))), 1000)
    const poll = setInterval(async () => {
      const r = await fetch(`/api/handoff/${h.id}`, { cache: 'no-store' }).catch(() => null)
      const s = r?.ok ? ((await r.json()) as { status: string | null }).status : null
      if (s === 'completed') {
        setState('completed')
        setTimeout(() => done.current(), 1500)
      } else if (s === 'expired' || Date.now() > h.expiresAt) setState('expired')
    }, 2500)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [h, state])

  async function copy() {
    if (!h) return
    try {
      await navigator.clipboard.writeText(h.url)
      toast.success(tx('링크를 복사했어요. 10분 안에 폰에서 한 번만 열 수 있어요.'))
    } catch {
      toast.error(tx('복사하지 못했어요. 직접 선택해서 복사해 주세요.'))
    }
  }

  if (state === 'completed') return <Done title={tx('폰에서 열었어요')} body={tx('폰에서 홈 화면에 추가하면 끝이에요. 잠시 후 다음으로 넘어가요.')} />
  return (
    <>
      <Head icon={<MonitorSmartphone className="w-5 h-5" />} title={tx('폰에서도 쓰도록 설정해요')} body={h?.oneTap ? tx('폰 카메라로 QR을 찍으면 이 계정으로 로그인된 채 열리고, 홈 화면에 추가하는 단계로 이어져요.') : tx('폰 카메라로 QR을 찍어 열고 같은 Google 계정으로 로그인하면, 홈 화면에 추가하는 단계로 이어져요.')} />
      <div className="app-setup-qr-row">
        <div className="app-setup-qr" aria-label={tx('폰으로 여는 QR 코드')} role="img">
          {state === 'pending' && h ? <span dangerouslySetInnerHTML={{ __html: h.svg }} /> : state === 'loading' ? <span className="app-setup-qr-wait animate-pulse" /> : (
            <button type="button" className="app-setup-qr-retry" onClick={() => void make()}>
              <RefreshCw className="w-5 h-5" /> <T>새 QR 만들기</T>
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] text-n-555" aria-live="polite">
            {state === 'pending' ? <T s="폰에서 열기를 기다리는 중 · {m}:{s} 남음" vars={{ m: Math.floor(left / 60), s: String(left % 60).padStart(2, '0') }} /> : state === 'expired' ? <T>시간이 지나 만료됐어요.</T> : state === 'limited' ? <T>QR을 짧은 시간에 여러 번 만들었어요. 몇 분 뒤에 새 QR을 만들어 주세요.</T> : state === 'error' ? <T>QR을 만들지 못했어요.</T> : <T>QR을 만드는 중…</T>}
          </p>
          {state === 'pending' && (
            <button type="button" className="filter-chip" onClick={copy}><Copy className="w-3.5 h-3.5" /> <T>링크 복사</T></button>
          )}
          <p className="text-[12px] text-n-888" style={{ wordBreak: 'keep-all' }}>{h?.oneTap ? <T>링크는 10분 동안 한 번만 쓸 수 있고, 다른 사람에게 보내면 그 사람이 내 계정으로 들어올 수 있어요.</T> : <T>링크는 10분 동안 한 번만 쓸 수 있고, 내 계정으로 로그인한 폰에서만 열려요.</T>}</p>
        </div>
      </div>
    </>
  )
}
