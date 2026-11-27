'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/i18n/client'
import { FEEDBACK_MODE_KEY, componentOf, elementTextOf, logoTap, selectorFor, type TapState } from '@/lib/feedback-client'
import { FeedbackThanks } from '@/components/feedback/feedback-thanks'
import { FeedbackCtx } from '@/components/feedback/feedback-context'

export { useFeedbackMode } from '@/components/feedback/feedback-context'

/**
 * A105 화면 피드백. Allowed members (admin or a 관리 › 유저 tester) turn it on from the account
 * menu, Shift+D, ?feedback=1, or by tapping the top logo 7 times. While on, every tap/click picks
 * the element under it (scrolling still works); a small sheet takes the note and the server stores
 * it with a viewport screenshot that has the box drawn in. Our own UI is [data-feedback-ui].
 */

type Picked = { el: Element; rect: DOMRect }

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))
}

function pickable(target: EventTarget | null): Element | null {
  let el = target instanceof Element ? target : null
  if (!el || el.closest('[data-feedback-ui], [data-feedback-logo], [data-sonner-toaster]')) return null
  // svg internals (icon paths) → the control around them
  if (el instanceof SVGElement) el = el.closest('button, a, [role="button"], label') ?? el.closest('svg') ?? el
  if (el === document.body || el === document.documentElement) return null
  return el
}

export function FeedbackModeProvider({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  const [on, setOnState] = useState(false)
  const t = useT()
  const taps = useRef<TapState>({ count: 0, last: 0 })
  // our own hint under the top bar (pointer-events: none) — a top toast would sit on the logo mid-count
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = useCallback((text: string, ms = 1600) => {
    if (hintTimer.current) clearTimeout(hintTimer.current)
    setHint({ text, key: Date.now() })
    hintTimer.current = setTimeout(() => setHint(null), ms)
  }, [])
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const setOn = useCallback(
    (v: boolean) => {
      if (!allowed) return
      setOnState(v)
      try {
        if (v) localStorage.setItem(FEEDBACK_MODE_KEY, '1')
        else localStorage.removeItem(FEEDBACK_MODE_KEY)
      } catch {}
      say(v ? t('피드백 모드를 켰어요 · 고칠 곳을 눌러 주세요') : t('피드백 모드를 껐어요'), 2200)
    },
    [allowed, t, say]
  )

  // restore per device; ?feedback=1 only works for someone already allowed
  useEffect(() => {
    if (!allowed) return
    let want = false
    try {
      want = localStorage.getItem(FEEDBACK_MODE_KEY) === '1'
    } catch {}
    const url = new URL(window.location.href)
    if (url.searchParams.get('feedback') === '1') {
      want = true
      try {
        localStorage.setItem(FEEDBACK_MODE_KEY, '1')
      } catch {}
      url.searchParams.delete('feedback')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
    if (want) queueMicrotask(() => setOnState(true))
  }, [allowed])

  // Shift+D (not while typing)
  useEffect(() => {
    if (!allowed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'd' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      e.preventDefault()
      setOn(!on)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allowed, on, setOn])

  // 7 taps on the logo (Android developer-mode style). The first tap of a streak navigates as usual;
  // the rest stay put so counting doesn't reload the feed. Not allowed → plain link.
  const logoClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!allowed || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      const step = logoTap(taps.current, Date.now())
      taps.current = step.state
      if (!step.first) e.preventDefault()
      if (step.toggle) setOn(!on)
      else if (step.remaining !== null) say(on ? t('{n}번 더 누르면 피드백 모드가 꺼져요', { n: step.remaining }) : t('{n}번 더 누르면 피드백 모드', { n: step.remaining }))
    },
    [allowed, on, setOn, t, say]
  )

  const value = useMemo(() => ({ allowed, on: allowed && on, setOn, logoClick }), [allowed, on, setOn, logoClick])
  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      {allowed && on && <FeedbackLayer onOff={() => setOn(false)} />}
      {hint && (
        <div key={hint.key} className="fb-hint-toast" data-feedback-ui="" role="status" aria-live="polite">
          {hint.text}
        </div>
      )}
    </FeedbackCtx.Provider>
  )
}

function FeedbackLayer({ onOff }: { onOff: () => void }) {
  const t = useT()
  const [hover, setHover] = useState<DOMRect | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const pickedRef = useRef<Picked | null>(null)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])

  // capture-phase blocking: the page underneath never sees the pick tap
  useEffect(() => {
    const block = (e: Event) => {
      if (!pickable(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    const onClick = (e: MouseEvent) => {
      const el = pickable(e.target)
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setPicked({ el, rect: el.getBoundingClientRect() })
      setHover(null)
    }
    let frame = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = pickable(document.elementFromPoint(e.clientX, e.clientY))
        setHover(el ? el.getBoundingClientRect() : null)
      })
    }
    const onScroll = () => {
      const p = pickedRef.current
      if (p) setPicked({ el: p.el, rect: p.el.getBoundingClientRect() })
      setHover(null)
    }
    const opts = { capture: true } as const
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'submit']) window.addEventListener(ev, block, opts)
    window.addEventListener('click', onClick, opts)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onScroll)
    document.documentElement.setAttribute('data-feedback-on', '')
    return () => {
      for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'submit']) window.removeEventListener(ev, block, opts)
      window.removeEventListener('click', onClick, opts)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
      document.documentElement.removeAttribute('data-feedback-on')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pickedRef.current) setPicked(null)
      else onOff()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOff])

  async function send() {
    const p = pickedRef.current
    const text = body.trim()
    if (!p || !text || sending) return
    setSending(true)
    try {
      const rect = p.el.getBoundingClientRect()
      const meta = {
        body: text,
        route: (window.location.pathname + window.location.search).slice(0, 500),
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100 },
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        locale: document.documentElement.lang === 'en' ? 'en' : 'ko',
        selector: selectorFor(p.el),
        component: componentOf(p.el),
        elementText: elementTextOf(p.el as HTMLElement),
        bbox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), pageX: Math.round(rect.left + window.scrollX), pageY: Math.round(rect.top + window.scrollY) },
      }
      const shot = await captureViewport(rect).catch((err) => {
        console.warn('[feedback] screenshot failed', err)
        return null
      })
      const fd = new FormData()
      fd.set('meta', JSON.stringify(meta))
      if (shot) fd.set('shot', shot, 'shot.jpg')
      const res = await fetch('/api/feedback', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('피드백을 보내지 못했어요.'))
      toast.success(shot ? t('피드백을 보냈어요') : t('피드백을 보냈어요 (스크린샷 없이)'))
      setPicked(null)
      setBody('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('피드백을 보내지 못했어요.'))
    } finally {
      setSending(false)
    }
  }

  const box = picked?.rect ?? hover
  return (
    <div data-feedback-ui="" className="fb-layer">
      {box && <div className={picked ? 'fb-box is-picked' : 'fb-box'} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden />}
      {picked ? (
        <div className="fb-sheet" role="dialog" aria-label={t('화면 피드백')}>
          <div className="fb-sheet-head">
            <span className="fb-target">{elementTextOf(picked.el as HTMLElement) || selectorFor(picked.el) || t('선택한 요소')}</span>
            <button type="button" className="fb-icon" onClick={() => setPicked(null)} aria-label={t('선택 취소')}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            className="input fb-input"
            rows={3}
            maxLength={2000}
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
            }}
            placeholder={t('무엇이 이상한가요? 어떻게 바뀌면 좋을지도 적어 주세요.')}
            aria-label={t('피드백 내용')}
          />
          <div className="fb-actions">
            <span className="fb-hint">{t('다른 곳을 누르면 대상이 바뀌어요')}</span>
            <button type="button" className="btn btn-secondary btn-sm min-h-[40px]" onClick={() => setPicked(null)}>
              {t('취소')}
            </button>
            <button type="button" className="btn btn-primary btn-sm min-h-[40px]" disabled={!body.trim() || sending} onClick={() => void send()}>
              {sending ? t('보내는 중…') : t('보내기')}
            </button>
          </div>
          <FeedbackThanks />
        </div>
      ) : (
        <button type="button" className="fb-pill" onClick={onOff} aria-label={t('피드백 모드 끄기')}>
          <MessageSquareText className="w-4 h-4" aria-hidden />
          <span>{t('피드백 모드')}</span>
          <span className="fb-pill-hint only-desktop">{t('요소를 눌러 남겨요')}</span>
          <X className="w-3.5 h-3.5 opacity-60" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** Viewport screenshot (our UI left out) with the picked box drawn in. null when the browser can't. */
async function captureViewport(rect: DOMRect): Promise<Blob | null> {
  const { domToCanvas } = await import('modern-screenshot')
  const w = window.innerWidth
  const h = window.innerHeight
  const scale = Math.min(window.devicePixelRatio || 1, 1.5)
  const bg = getComputedStyle(document.body).backgroundColor || getComputedStyle(document.documentElement).backgroundColor
  const work = domToCanvas(document.body, {
    width: w,
    height: h,
    scale,
    backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
    timeout: 1500,
    style: { marginTop: `${-window.scrollY}px`, marginLeft: `${-window.scrollX}px` },
    drawImageInterval: 30,
    // our UI and toasts stay out; so does everything wholly below the fold (fewer nodes and images
    // to inline — WebKit redraws once per image). Below-the-fold nodes can't move what's above them.
    filter: (n) => {
      if (!(n instanceof Element)) return true
      if (n.hasAttribute('data-feedback-ui') || n.hasAttribute('data-sonner-toaster')) return false
      return n.getBoundingClientRect().top <= h + 4
    },
  })
  const canvas = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 12000))])
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(255, 59, 48, 0.12)'
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height)
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ff3b30'
  ctx.strokeRect(rect.left - 1.5, rect.top - 1.5, rect.width + 3, rect.height + 3)
  ctx.restore()
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    } catch {
      resolve(null) // tainted canvas
    }
  })
}
