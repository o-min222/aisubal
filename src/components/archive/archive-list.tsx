import Link from 'next/link'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { KstDate } from '@/components/kst-date'
import { KIND_ICON, hostOf } from './archive-kind'
import { ARCHIVE_KIND_LABEL, archiveRefLabel, type ArchiveItem } from '@/lib/archive-rules'

const withOpen = (base: string, id: string) => {
  const [p, qs = ''] = base.split('?')
  const s = new URLSearchParams(qs)
  s.set('open', id)
  return `${p}?${s}`
}

/**
 * Clean archive list: type icon, title, source/author, saved date, memo
 * snippet, tags. No checkboxes or per-row buttons (site rule): the row opens
 * the detail pane, where the memo/tags are edited and the item is removed.
 */
export async function ArchiveList({ items, base, openId }: { items: ArchiveItem[]; base: string; openId: string | null }) {
  const st = await getT()
  return (
    <div className="crow-list" role="list" aria-label={st('아카이브 항목')}>
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind]
        const source = it.kind === 'link' ? hostOf(it.sourceUrl) : it.authorKind === 'anon' ? st('익명') : it.authorLabel
        return (
          <div key={it.id} role="listitem" className="archive-row">
            <Link href={withOpen(base, it.id)} scroll={false} className={`crow${openId === it.id ? ' on' : ''}`} aria-current={openId === it.id ? 'true' : undefined}>
              <span className="crow-lead archive-kind" title={st(ARCHIVE_KIND_LABEL[it.kind])}>
                <Icon className="w-4 h-4" aria-hidden />
              </span>
              <span className="crow-main">
                <span className="crow-top">
                  <span className="crow-title">{it.title}</span>
                  {it.refNo && <span className="archive-ref">#{archiveRefLabel(it.refNo)}</span>}
                </span>
                {it.memo && <span className="crow-preview">📝 {it.memo}</span>}
                <span className="crow-meta">
                  <T>{ARCHIVE_KIND_LABEL[it.kind]}</T>
                  {source && <> · {source}</>}
                  {' · '}
                  <KstDate iso={it.createdAt} part="short" />
                  {it.tags.slice(0, 3).map((t) => (
                    <span key={t} className="archive-tag">#{t}</span>
                  ))}
                </span>
              </span>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
