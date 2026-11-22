import Link from 'next/link'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { RelativeTime } from '@/components/relative-time'
import type { DupCandidate, ReviewLogItem, Submission } from '@/lib/data/tool-submissions'
import { DUP_REASON_LABEL, LOG_ACTION_LABEL, STATUS_LABEL, STATUS_STYLE, isStale } from '@/lib/tool-review'
import { TOOL_TYPE_CHIP } from '@/lib/tool-rules'
import { WithdrawButton } from './withdraw-button'

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
      {STATUS_LABEL[status]}
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
            <span className="font-semibold text-[15px] text-[#111] truncate max-w-full">{s.name}</span>
            <span className="cat-chip">{typeLabel}</span>
          </div>
          <p className="text-[13.5px] text-[#555] mt-1 break-words">{s.oneLiner}</p>
          <div className="crow-meta">
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-[#0066cc]">
              <ExternalLink className="w-3 h-3" /> {host(s.url)}
            </a>
            <span>{s.submittedBy}</span>
            <span>
              <RelativeTime date={s.createdAt} />
            </span>
            {mode === 'admin' && s.status === 'pending' && isStale(s.snapshotAt) && <span className="text-[#9a5b00]">스냅샷 없음/오래됨</span>}
          </div>
        </div>
        {mode === 'mine' && s.status === 'pending' && <WithdrawButton id={s.id} name={s.name} />}
      </div>
      {s.reason && (
        <p className="sub-reason">
          <b>{s.status === 'rejected' ? '반려 사유' : '검토 메모'}</b> {s.reason}
        </p>
      )}
      {s.entry && s.status === 'approved' && (
        <Link href={`/tools/${s.entry.slug}`} className="text-[13px] text-[#0066cc]">
          등록된 툴 보기 →
        </Link>
      )}
      {s.duplicateOf && (
        <p className="text-[12.5px] text-[#666]">
          중복: <Link href={`/tools/${s.duplicateOf.slug}`} className="text-[#0066cc]">{s.duplicateOf.name}</Link>
        </p>
      )}
      {mode === 'admin' && dups.length > 0 && (
        <p className="sub-dups">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            중복 후보:{' '}
            {dups.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <Link href={`/tools/${d.slug}`} className="text-[#0066cc]">{d.name}</Link> ({DUP_REASON_LABEL[d.reason] ?? d.reason})
              </span>
            ))}
          </span>
        </p>
      )}
      {(s.description || s.note || log.length > 0) && (
        <details className="sub-details" open={open}>
          <summary>자세히</summary>
          {s.description && <p className="whitespace-pre-wrap break-words">{s.description}</p>}
          {s.note && (
            <p className="whitespace-pre-wrap break-words">
              <b>써본 경험</b> {s.note}
            </p>
          )}
          {s.tags.length > 0 && <p className="text-[#888]">{s.tags.map((t) => `#${t}`).join(' ')}</p>}
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
