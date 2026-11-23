'use client'

import { useEffect, useState } from 'react'
import { CalendarPlus, Copy, Download, ExternalLink, Rss } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { googleCalendarUrl, type MineMeetup } from '@/lib/moim-calendar'
import { T } from '@/i18n/t'
import { tx, useLocale, useT } from '@/i18n/client'
import { KstDate } from '@/components/kst-date'

type FeedStatus = { enabled: boolean; prefix?: string; createdAt?: string; lastFetchedAt?: string | null }

/** A53: add one 모임 to a calendar, or subscribe to all of mine (private, revocable feed). */
export function MoimCalendarMenu({ moim }: { moim: MineMeetup }) {
  const t = useT()
  const [sheet, setSheet] = useState(false)
  const lang = useLocale() === 'en' ? 'en' : 'ko'
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="icon-btn tap-target inline-flex items-center justify-center rounded-full" aria-label={tx('캘린더에 추가')} title={tx('캘린더에 추가')}>
          <CalendarPlus className="w-[18px] h-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[210px]">
          <DropdownMenuItem render={<a href={`/api/moim/${moim.id}/ics`} download />}>
            <Download className="w-4 h-4" /> <T>캘린더 파일(.ics) 받기</T>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(googleCalendarUrl(moim, window.location.origin, lang), '_blank', 'noopener,noreferrer')}>
            <ExternalLink className="w-4 h-4" /> <T>Google 캘린더에 추가</T>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSheet(true)}>
            <Rss className="w-4 h-4" /> <T>내 모임 캘린더 구독…</T>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AdaptiveSheet open={sheet} onOpenChange={setSheet} title={t('내 모임 캘린더 구독')}>
        {sheet && <IcsFeedPanel />}
      </AdaptiveSheet>
    </>
  )
}

export function IcsFeedPanel() {
  const t = useT()
  const [status, setStatus] = useState<FeedStatus | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/moim/ics-feed').then((r) => (r.ok ? r.json() : null)).then((s) => setStatus(s ?? { enabled: false })).catch(() => setStatus({ enabled: false }))
  }, [])

  async function create(replace: boolean) {
    if (replace && !window.confirm(t('새 링크를 만들면 지금 쓰는 구독 링크는 더 이상 동작하지 않아요. 계속할까요?'))) return
    setBusy(true)
    try {
      const r = await fetch('/api/moim/ics-feed', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setUrl(new URL(j.path, window.location.origin).toString())
      setStatus(j.status)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t('잠시 후 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!window.confirm(t('구독을 끄면 캘린더 앱에서 내 모임이 더 이상 갱신되지 않아요. 끌까요?'))) return
    setBusy(true)
    try {
      const r = await fetch('/api/moim/ics-feed', { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setStatus(await r.json())
      setUrl(null)
    } catch {
      toast.error(t('잠시 후 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('복사했어요'))
    } catch {
      toast.error(t('복사하지 못했어요'))
    }
  }

  const webcal = url?.replace(/^https?:/, 'webcal:')
  return (
    <div className="cal-feed">
      <p className="cal-hint">
        <T>내가 열거나 신청·초대받은 모임이 캘린더 앱에 자동으로 들어와요. 시간·장소가 바뀌면 같이 바뀌어요.</T>
      </p>
      {!status ? (
        <p className="cal-muted"><T>불러오는 중…</T></p>
      ) : url ? (
        <>
          <div className="td-cli cal-url">
            <code title={url}>{url}</code>
            <button type="button" className="icon-btn" onClick={copy} aria-label={t('구독 링크 복사')} title={t('복사')}>
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="cal-links">
            <a className="text-link" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal || '')}`} target="_blank" rel="noopener noreferrer"><T>Google 캘린더</T></a>
            <span aria-hidden>·</span>
            <a className="text-link" href={webcal}><T>Apple·Outlook</T></a>
          </p>
          <p className="cal-muted"><T>이 링크는 지금만 보여요. 나만 아는 곳에 두세요. 링크를 가진 사람은 내 모임 일정을 볼 수 있어요.</T></p>
        </>
      ) : status.enabled ? (
        <p className="cal-muted">
          <T>구독 켜짐</T> · <T s="{prefix}… 링크" vars={{ prefix: status.prefix ?? '' }} />
          {status.createdAt && <> · <KstDate iso={status.createdAt} /></>}
          {status.lastFetchedAt ? <> · <T>마지막 동기화</T> <KstDate iso={status.lastFetchedAt} /></> : <> · <T>아직 동기화 전</T></>}
        </p>
      ) : (
        <p className="cal-muted"><T>아직 구독 링크가 없어요.</T></p>
      )}
      {status && (
        <div className="cal-actions">
          {!status.enabled ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => create(false)}>
              <T>구독 링크 만들기</T>
            </button>
          ) : (
            <>
              <button type="button" className="text-link cal-action" disabled={busy} onClick={() => create(true)}><T>새 링크 만들기</T></button>
              <span aria-hidden className="cal-muted">·</span>
              <button type="button" className="text-link cal-action cal-danger" disabled={busy} onClick={revoke}><T>구독 끄기</T></button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
