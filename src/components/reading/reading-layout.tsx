import Link from 'next/link'
import { ArrowLeft, Maximize2, PanelRight, X } from 'lucide-react'
import { PaneKeys } from './pane-keys'
import { msg } from '@/i18n/translate'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/**
 * List + reading pane (no infinite scroll).
 *  - Desktop ≥1280px (list keeps ≥560px): compact list on the left, the opened item in a sticky pane
 *    on the right (the right rail steps aside).
 *  - Narrower: the opened item is a full-screen push over the list.
 * The open item lives in the URL (?open=<id>), so back/forward, refresh and
 * sharing all work and the list keeps its page and tab.
 */
export async function ReadingLayout({
  list,
  pane,
  openId,
  closeHref,
  fullHref,
  paneTitle,
  emptyTitle = msg('항목을 고르면 여기에서 읽어요'),
  emptyHint = msg('목록에서 하나를 누르면 이 자리에 열려요. 모바일에서는 전체 화면으로 열려요.'),
}: {
  list: React.ReactNode
  pane: React.ReactNode | null
  openId: string | null
  closeHref: string
  fullHref?: string | null
  paneTitle?: string
  emptyTitle?: string
  emptyHint?: string
}) {
  const st = await getT()
  const open = Boolean(openId && pane)
  return (
    <div className={`reading-layout${open ? ' has-open' : ''}`}>
      <div className="reading-list">{list}</div>
      <aside className={`reading-pane${open ? ' is-open' : ''}`} aria-label={paneTitle ? st('{paneTitle} 읽기', { paneTitle }) : st('읽기 창')}>
        {open ? (
          <>
            <div className="reading-pane-bar">
              <Link href={closeHref} scroll={false} className="pane-back" aria-label={st('목록으로 돌아가기')}>
                <ArrowLeft className="w-5 h-5" />
                <span><T>목록</T></span>
              </Link>
              <span className="pane-title truncate">{paneTitle}</span>
              {fullHref && (
                <Link href={fullHref} className="pane-icon" aria-label={st('전체 페이지로 열기')} title={st('전체 페이지로 열기')}>
                  <Maximize2 className="w-4 h-4" />
                </Link>
              )}
              <Link href={closeHref} scroll={false} className="pane-icon pane-close" aria-label={st('읽기 창 닫기')} title={st('닫기 (Esc)')}>
                <X className="w-4 h-4" />
              </Link>
            </div>
            <div className="reading-pane-body" key={openId}>
              {pane}
            </div>
            <PaneKeys closeHref={closeHref} />
          </>
        ) : (
          <div className="reading-empty">
            <PanelRight className="w-7 h-7" aria-hidden />
            <p className="font-semibold" style={{ color: '#333' }}>
              <T>{emptyTitle}</T>
            </p>
            <p className="text-[13px]" style={{ color: '#888' }}>
              <T>{emptyHint}</T>
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

/** Keeps every other query param, sets or clears ?open. */
export function openHref(base: string, id: string | null): string {
  const [path, qs = ''] = base.split('?')
  const p = new URLSearchParams(qs)
  p.delete('open')
  if (id) p.set('open', id)
  const s = p.toString()
  return s ? `${path}?${s}` : path
}
