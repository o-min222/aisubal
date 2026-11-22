import Link from 'next/link'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { RelativeTime } from '@/components/relative-time'
import type { DupCandidate, ReviewLogItem, Submission } from '@/lib/data/tool-submissions'
import { DUP_REASON_LABEL, LOG_ACTION_LABEL, STATUS_LABEL, STATUS_STYLE, isStale } from '@/lib/tool-review'
import { TOOL_TYPE_CHIP } from '@/lib/tool-rules'
import { WithdrawButton } from './withdraw-button'
import { T } from '@/i18n/t'

const host = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return u
  }
}

export function StatusChip({ status }: { status: Submission['status'] }) {
  const st = STATUS_STYLE[status]
  return (
    <span className="crow-chip" style={{ background: st.bg, color: st.fg }}>
      <T>{STATUS_LABEL[status]}</T>
    </span>
  )
}

/**
 * One tool submission. Fields were written by a member's AI: render as plain
 * text only (no markdown/HTML), links are rel=nofollow.
 */
export function SubmissionRow({ s, mode, dups = [], log = [], open = false }: { s: Submission; mode: 'mine' | 'admin'; dups?: DupCandidate[]; log?: ReviewLogItem[]; open?: boolean }) {
  const typeLabel = (TOOL_TYPE_CHIP as Record<string, string>)[s.type] ?? s.type
  return (
    <li className="sub-row" id={`sub-${s.id}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <StatusChip status={s.status} />
            <span className="font-semibold text-[15px] text-n-111 truncate max-w-full">{s.name}</span>
            <span className="cat-chip">{typeLabel}</span>
          </div>
          <p className="text-[13.5px] text-n-555 mt-1 break-words">{s.oneLiner}</p>
          <div className="crow-meta">
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-c-06c">
              <ExternalLink className="w-3 h-3" /> {host(s.url)}
            </a>
            <span>{s.submittedBy}</span>
            <span>
              <RelativeTime date={s.createdAt} />
            </span>
            {mode === 'admin' && s.status === 'pending' && isStale(s.snapshotAt) && <span className="text-c-9a5b00"><T>스냅샷 없음/오래됨</T></span>}
          </div>
        </div>
        {mode === 'mine' && s.status === 'pending' && <WithdrawButton id={s.id} name={s.name} />}
      </div>
      {s.reason && (
        <p className="sub-reason">
          <b>{s.status === 'rejected' ? <T>반려 사유</T> : <T>검토 메모</T>}</b> {s.reason}
        </p>
      )}
      {s.entry && s.status === 'approved' && (
        <Link href={`/gallery/${s.entry.slug}`} className="text-[13px] text-c-06c">
          <T>갤러리에서 보기 →</T>
        </Link>
      )}
      {s.duplicateOf && (
        <p className="text-[12.5px] text-n-666">
          <T>중복:</T> <Link href={`/gallery/${s.duplicateOf.slug}`} className="text-c-06c">{s.duplicateOf.name}</Link>
        </p>
      )}
      {mode === 'admin' && dups.length > 0 && (
        <p className="sub-dups">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span><T s="중복 후보: {v}" vars={{ v: dups.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <Link href={`/gallery/${d.slug}`} className="text-c-06c">{d.name}</Link> ({DUP_REASON_LABEL[d.reason] ?? d.reason})
              </span>
            )) }} /></span>
        </p>
      )}
      {(s.description || s.note || log.length > 0) && (
        <details className="sub-details" open={open}>
          <summary><T>자세히</T></summary>
          {s.description && <p className="whitespace-pre-wrap break-words">{s.description}</p>}
          {s.note && (
            <p className="whitespace-pre-wrap break-words">
              <b><T>써본 경험</T></b> {s.note}
            </p>
          )}
          {s.tags.length > 0 && <p className="text-n-888">{s.tags.map((t) => `#${t}`).join(' ')}</p>}
          {log.length > 0 && (
            <ol className="sub-log">
              {log.map((l) => (
                <li key={l.id}>
                  <b>{LOG_ACTION_LABEL[l.action] ?? l.action}</b> · {l.actorLabel} · <RelativeTime date={l.createdAt} />
                  {l.reason && <> · {l.reason}</>}
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </li>
  )
}
