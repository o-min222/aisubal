'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  MapPin,
  Monitor,
  Users,
  Clock,
  Loader2,
  Megaphone,
  Ban,
  Check,
  X,
  ExternalLink,
} from 'lucide-react'
import type { Member, MeetupRsvp, PostAs } from '@/lib/supabase/types'
import type { MeetupWithDetails } from '@/lib/data/types'
import {
  canSeeMeetingUrl,
  countConfirmed,
  countWaitlisted,
  isApplyOpen,
  isPastMeetup,
} from '@/lib/meetup-rules'
import {
  memberHasNicknameProfile,
  nicknameProfilePublicId,
  publicAuthorLabel,
  toPublicAuthor,
} from '@/lib/profile'
import { AuthorAvatar, UserAvatar } from '@/components/user-avatar'
import { MarkdownBody } from '@/components/markdown-body'
import { SaveToArchiveButton } from '@/components/save-to-archive-button'
import { toast } from 'sonner'

interface MeetupDetailClientProps {
  initialMeetup: MeetupWithDetails
  member: Member
  members: Member[]
}

function formatKst(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const RSVP_STATUS_LABEL: Record<string, string> = {
  confirmed: '참가 확정',
  pending: '승인 대기',
  waitlisted: '대기열',
  rejected: '거절됨',
  cancelled: '취소됨',
}

function mergeMeetupState(
  next: MeetupWithDetails,
  prev: MeetupWithDetails
): MeetupWithDetails {
  const rsvps = next.rsvps ?? prev.rsvps
  return {
    ...prev,
    ...next,
    rsvps,
    host: next.host?.id ? next.host : prev.host,
    announcements:
      next.announcements?.length > 0 ? next.announcements : prev.announcements,
    confirmed_count: countConfirmed(rsvps),
    waitlisted_count: countWaitlisted(rsvps),
  }
}

function attendeeAuthor(
  rsvp: MeetupRsvp,
  isHost: boolean,
  members: Member[]
): ReturnType<typeof toPublicAuthor> | null {
  if (rsvp.posted_as === 'nickname') {
    const found =
      members.find((m) => m.id === rsvp.member_id) ??
      members.find(
        (m) =>
          rsvp.nickname_profile_id &&
          nicknameProfilePublicId(m.id) === rsvp.nickname_profile_id
      )
    if (!found && !isHost) {
      return rsvp.nickname_profile_id
        ? {
            kind: 'nickname',
            id: rsvp.nickname_profile_id,
            nickname: '별명 멤버',
            bio: null,
            avatar_url: null,
          }
        : null
    }
    if (found) return toPublicAuthor(found, 'nickname')
    return null
  }
  if (!rsvp.member_id && !isHost) return null
  const found = members.find((m) => m.id === rsvp.member_id)
  return found ? toPublicAuthor(found, 'real') : null
}

export function MeetupDetailClient({
  initialMeetup,
  member,
  members,
}: MeetupDetailClientProps) {
  const [meetup, setMeetup] = useState(initialMeetup)
  const [loading, setLoading] = useState(false)
  const [rsvpNote, setRsvpNote] = useState('')
  const [rsvpPostedAs, setRsvpPostedAs] = useState<PostAs>('real')
  const [announcementBody, setAnnouncementBody] = useState('')

  const isHost = meetup.host_id === member.id
  const myRsvp = meetup.rsvps.find(
    (r) =>
      r.member_id === member.id &&
      r.status !== 'cancelled' &&
      r.status !== 'rejected'
  )
  const past = isPastMeetup(meetup) || meetup.status === 'past'
  const cancelled = meetup.status === 'cancelled'
  const showMeetingUrl = canSeeMeetingUrl(meetup, myRsvp, isHost)
  const applyOpen = isApplyOpen(meetup)
  const hasNick = memberHasNicknameProfile(member)

  const visibleRsvps = useMemo(
    () =>
      meetup.rsvps.filter(
        (r) =>
          r.status === 'confirmed' ||
          r.status === 'pending' ||
          r.status === 'waitlisted'
      ),
    [meetup.rsvps]
  )

  const pendingForHost = useMemo(
    () => meetup.rsvps.filter((r) => r.status === 'pending'),
    [meetup.rsvps]
  )

  const refreshMeetup = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetups/${meetup.id}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '모임 정보를 불러오지 못했습니다.')
        return
      }
      setMeetup((prev) => mergeMeetupState(data.meetup as MeetupWithDetails, prev))
    } catch {
      toast.error('네트워크 오류')
    }
  }, [meetup.id])

  async function rsvpAction(
    action: 'apply' | 'cancel' | 'approve' | 'reject',
    extra?: { rsvp_id?: string }
  ) {
    setLoading(true)
    try {
      const res = await fetch(`/api/meetups/${meetup.id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: action === 'apply' ? rsvpNote || undefined : undefined,
          posted_as: action === 'apply' ? rsvpPostedAs : undefined,
          rsvp_id: extra?.rsvp_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '처리에 실패했습니다.')
        return
      }
      if (data.meetup) {
        setMeetup((prev) => mergeMeetupState(data.meetup as MeetupWithDetails, prev))
      } else {
        await refreshMeetup()
      }
      if (action === 'apply') toast.success('참가 신청이 접수되었습니다.')
      if (action === 'cancel') toast.success('참가를 취소했습니다.')
      if (action === 'approve') toast.success('승인했습니다.')
      if (action === 'reject') toast.success('거절했습니다.')
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  async function cancelMeetup() {
    if (!confirm('정말 이 모임을 취소할까요?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/meetups/${meetup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '취소에 실패했습니다.')
        return
      }
      setMeetup((prev) => ({ ...prev, ...data.meetup }))
      toast.success('모임이 취소되었습니다.')
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  async function postAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    if (!announcementBody.trim()) {
      toast.error('공지 내용을 입력해 주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/meetups/${meetup.id}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: announcementBody.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '공지 등록 실패')
        return
      }
      setMeetup((prev) => ({
        ...prev,
        announcements: [...prev.announcements, data.announcement],
      }))
      setAnnouncementBody('')
      toast.success('공지가 등록되었습니다.')
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/meetups"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        모임 목록
      </Link>

      <article className="card p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`badge ${meetup.mode === 'online' ? 'badge-mcp' : 'badge-note'}`}>
            {meetup.mode === 'online' ? '온라인' : '오프라인'}
          </span>
          {meetup.requires_approval && (
            <span className="badge badge-agent">호스트 승인제</span>
          )}
          {cancelled && <span className="badge bg-[#eee] text-[#666]">취소됨</span>}
          {past && !cancelled && <span className="badge bg-[#eee] text-[#666]">종료</span>}
        </div>

        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-[#111]">{meetup.title}</h1>
          <SaveToArchiveButton
            sourceType="meetup"
            sourceId={meetup.id}
            title={meetup.title}
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-[#666] mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <AuthorAvatar author={meetup.host} />
            <span className="font-medium text-[#333]">{publicAuthorLabel(meetup.host)}</span>
            <span className="text-xs text-[#888]">호스트</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-sm mb-6">
          <div className="flex items-start gap-2 text-[#666]">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[#111]">일시</p>
              <p>{formatKst(meetup.starts_at)}</p>
              {meetup.ends_at && (
                <p className="text-[#888]">~ {formatKst(meetup.ends_at)}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 text-[#666]">
            <Users className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[#111]">정원</p>
              <p>
                확정 {meetup.confirmed_count}명 / 최대 {meetup.capacity}명
                {meetup.waitlisted_count > 0 && (
                  <span className="text-[#888]"> · 대기 {meetup.waitlisted_count}명</span>
                )}
              </p>
            </div>
          </div>
          {meetup.apply_deadline && (
            <div className="flex items-start gap-2 text-[#666] sm:col-span-2">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-[#111]">신청 마감</p>
                <p>{formatKst(meetup.apply_deadline)}</p>
              </div>
            </div>
          )}
          {meetup.fee_note && (
            <div className="text-[#666] sm:col-span-2">
              <p className="font-medium text-[#111]">참가비·비용</p>
              <p>{meetup.fee_note}</p>
            </div>
          )}
        </div>

        {meetup.mode === 'offline' ? (
          <div className="rounded-lg border border-[#e5e5e5] p-4 mb-6 bg-[#fafafa]">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 mt-0.5 text-[#666]" />
              <div>
                <p className="font-medium text-[#111]">{meetup.venue_name}</p>
                {meetup.venue_address && (
                  <p className="text-[#666] mt-0.5">{meetup.venue_address}</p>
                )}
                {meetup.map_url && (
                  <a
                    href={meetup.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0066cc] mt-2 hover:underline"
                  >
                    지도 보기 <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-[#e5e5e5] p-4 mb-6 bg-[#fafafa]">
            <div className="flex items-start gap-2 text-sm">
              <Monitor className="w-4 h-4 mt-0.5 text-[#666]" />
              <div>
                <p className="font-medium text-[#111]">온라인 참가 링크</p>
                {showMeetingUrl && meetup.meeting_url ? (
                  <a
                    href={meetup.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0066cc] hover:underline break-all"
                  >
                    {meetup.meeting_url}
                  </a>
                ) : (
                  <p className="text-[#888]">확정 참가자에게만 공개</p>
                )}
              </div>
            </div>
          </div>
        )}

        <MarkdownBody content={meetup.description} />

        {past && meetup.recap_photos && meetup.recap_photos.length > 0 && (
          <div className="mt-8 border-t border-[#e5e5e5] pt-6">
            <h2 className="text-lg font-semibold text-[#111] mb-3">모임 사진</h2>
            <div className="grid grid-cols-2 gap-3">
              {meetup.recap_photos.map((src) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-video overflow-hidden rounded-lg bg-[#e5e5e5]"
                >
                  <Image src={src} alt="" fill className="object-cover" unoptimized />
                </a>
              ))}
            </div>
            {meetup.recap_post_id && (
              <Link
                href={`/posts/${meetup.recap_post_id}`}
                className="inline-block mt-3 text-sm text-[#0066cc] hover:underline"
              >
                회고 글 보기 →
              </Link>
            )}
          </div>
        )}
      </article>

      {meetup.announcements.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#111] mb-4 flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            호스트 공지
          </h2>
          <ul className="space-y-3">
            {meetup.announcements.map((a) => (
              <li key={a.id} className="text-sm border-l-2 border-[#0066cc] pl-3">
                <p className="text-[#333]">{a.body}</p>
                <p className="text-xs text-[#888] mt-1">{formatKst(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!past && !cancelled && !isHost && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#111] mb-4">참가 신청</h2>

          {myRsvp ? (
            <div className="space-y-4">
              <p className="text-sm text-[#666]">
                내 상태:{' '}
                <span className="font-medium text-[#111]">
                  {RSVP_STATUS_LABEL[myRsvp.status] ?? myRsvp.status}
                </span>
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => rsvpAction('cancel')}
                className="btn btn-secondary btn-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '참가 취소'}
              </button>
            </div>
          ) : applyOpen ? (
            <div className="space-y-4">
              {hasNick && (
                <div>
                  <label className="block text-sm font-medium text-[#333] mb-2">
                    참가 프로필
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setRsvpPostedAs('real')}
                      className={`profile-switch ${rsvpPostedAs === 'real' ? 'active' : ''}`}
                    >
                      <UserAvatar
                        id={member.id}
                        name={member.display_name}
                        avatarUrl={member.avatar_url}
                        size="sm"
                      />
                      <span>{member.display_name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRsvpPostedAs('nickname')}
                      className={`profile-switch ${rsvpPostedAs === 'nickname' ? 'active' : ''}`}
                    >
                      <UserAvatar
                        id={`nick_${member.id}`}
                        name={member.nickname!}
                        avatarUrl={member.nickname_avatar_url}
                        size="sm"
                      />
                      <span>{member.nickname}</span>
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">
                  호스트에게 메모 (선택)
                </label>
                <textarea
                  value={rsvpNote}
                  onChange={(e) => setRsvpNote(e.target.value)}
                  className="input w-full min-h-[80px]"
                  placeholder="준비물, 질문 등"
                  maxLength={500}
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => rsvpAction('apply')}
                className="btn btn-primary"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '참가 신청'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-[#888]">신청이 마감되었거나 정원이 마감되었습니다.</p>
          )}
        </div>
      )}

      {isHost && !past && (
        <div className="card p-6 mb-6 space-y-6">
          <h2 className="text-lg font-semibold text-[#111]">호스트 도구</h2>

          {pendingForHost.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[#333] mb-2">승인 대기</h3>
              <ul className="space-y-2">
                {pendingForHost.map((r) => {
                  const author = attendeeAuthor(r, true, members)
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm border border-[#e5e5e5] rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2">
                        {author && <AuthorAvatar author={author} size="sm" />}
                        <span>{author ? publicAuthorLabel(author) : '신청자'}</span>
                        {r.note && (
                          <span className="text-[#888] text-xs">· {r.note}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => rsvpAction('approve', { rsvp_id: r.id })}
                          className="btn btn-primary btn-sm"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => rsvpAction('reject', { rsvp_id: r.id })}
                          className="btn btn-secondary btn-sm"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!cancelled && (
            <form onSubmit={postAnnouncement} className="space-y-2">
              <h3 className="text-sm font-medium text-[#333]">공지 보내기</h3>
              <textarea
                value={announcementBody}
                onChange={(e) => setAnnouncementBody(e.target.value)}
                className="input w-full min-h-[72px]"
                placeholder="참가자에게 전달할 안내"
                maxLength={2000}
              />
              <button type="submit" disabled={loading} className="btn btn-secondary btn-sm">
                공지 등록
              </button>
            </form>
          )}

          {!cancelled && (
            <button
              type="button"
              disabled={loading}
              onClick={cancelMeetup}
              className="btn btn-secondary btn-sm text-red-600 border-red-200"
            >
              <Ban className="w-4 h-4" />
              모임 취소
            </button>
          )}
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-[#111] mb-4">
          참가자 ({visibleRsvps.length})
        </h2>
        {visibleRsvps.length === 0 ? (
          <p className="text-sm text-[#888]">아직 참가자가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {visibleRsvps.map((r) => {
              const author = attendeeAuthor(r, isHost, members)
              if (!author) return null
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <AuthorAvatar author={author} size="sm" />
                    <span className="text-[#333]">{publicAuthorLabel(author)}</span>
                    {r.posted_as === 'nickname' && (
                      <span className="badge badge-agent text-xs">별명</span>
                    )}
                  </div>
                  <span className="text-[#888] text-xs">
                    {RSVP_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}