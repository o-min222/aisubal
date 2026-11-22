'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, MapPin, Monitor } from 'lucide-react'
import type { Member, MeetupMode, PostAs } from '@/lib/supabase/types'
import { UserAvatar } from '@/components/user-avatar'
import { memberHasNicknameProfile } from '@/lib/profile'
import { toast } from 'sonner'

interface NewMeetupClientProps {
  member: Member
  nicknameUnlocked: boolean
}

function toKstIso(localDatetime: string): string {
  if (!localDatetime) return ''
  return `${localDatetime}:00+09:00`
}

export function NewMeetupClient({ member, nicknameUnlocked }: NewMeetupClientProps) {
  const router = useRouter()
  const hasNick = memberHasNicknameProfile(member)
  const [loading, setLoading] = useState(false)
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  const [mode, setMode] = useState<MeetupMode>('offline')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [capacity, setCapacity] = useState(10)
  const [applyDeadline, setApplyDeadline] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [feeNote, setFeeNote] = useState('')
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim() || !startsAt) {
      toast.error('제목, 설명, 시작 일시는 필수입니다.')
      return
    }
    if (mode === 'offline' && !venueName.trim()) {
      toast.error('오프라인 모임은 장소명이 필요합니다.')
      return
    }
    if (mode === 'online' && !meetingUrl.trim()) {
      toast.error('온라인 모임은 미팅 URL이 필요합니다.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          mode,
          venue_name: mode === 'offline' ? venueName.trim() : null,
          venue_address: mode === 'offline' ? venueAddress.trim() || null : null,
          map_url: mode === 'offline' && mapUrl.trim() ? mapUrl.trim() : null,
          meeting_url: mode === 'online' ? meetingUrl.trim() : null,
          starts_at: toKstIso(startsAt),
          ends_at: endsAt ? toKstIso(endsAt) : null,
          capacity,
          apply_deadline: applyDeadline ? toKstIso(applyDeadline) : null,
          requires_approval: requiresApproval,
          fee_note: feeNote.trim() || null,
          posted_as: postedAs,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '모임 생성 실패')
        return
      }
      toast.success('모임이 생성되었습니다.')
      router.push(`/meetups/${data.meetup.id}`)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/meetups"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        모임 목록
      </Link>

      <div className="card">
        <div className="p-6 border-b border-[#e5e5e5]">
          <h1 className="text-xl font-bold text-[#111]">모임 만들기</h1>
          <p className="text-sm text-[#666] mt-1">
            오프라인·온라인 모임을 열고 멤버들을 초대하세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">게시 프로필</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPostedAs('real')}
                className={`profile-switch ${postedAs === 'real' ? 'active' : ''}`}
              >
                <UserAvatar
                  id={member.id}
                  name={member.display_name}
                  avatarUrl={member.avatar_url}
                  size="sm"
                />
                <span>{member.display_name}</span>
                <span className="text-xs text-[#888]">실명</span>
              </button>
              {nicknameUnlocked && hasNick ? (
                <button
                  type="button"
                  onClick={() => setPostedAs('nickname')}
                  className={`profile-switch ${postedAs === 'nickname' ? 'active' : ''}`}
                >
                  <UserAvatar
                    id={`nick_${member.id}`}
                    name={member.nickname!}
                    avatarUrl={member.nickname_avatar_url}
                    size="sm"
                  />
                  <span>{member.nickname}</span>
                  <span className="text-xs text-[#888]">별명</span>
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">모임 형태</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('offline')}
                className={`tab-filter flex items-center gap-2 ${mode === 'offline' ? 'active' : ''}`}
              >
                <MapPin className="w-4 h-4" />
                오프라인
              </button>
              <button
                type="button"
                onClick={() => setMode('online')}
                className={`tab-filter flex items-center gap-2 ${mode === 'online' ? 'active' : ''}`}
              >
                <Monitor className="w-4 h-4" />
                온라인
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="모임 제목"
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">설명 (마크다운)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full min-h-[160px] font-mono text-sm"
              placeholder="모임 소개, 준비물, 진행 방식..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">시작 (KST)</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">종료 (선택)</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">정원</label>
              <input
                type="number"
                min={1}
                max={500}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">신청 마감 (선택)</label>
              <input
                type="datetime-local"
                value={applyDeadline}
                onChange={(e) => setApplyDeadline(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#333] cursor-pointer">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="rounded border-[#ccc]"
            />
            호스트 승인 후 참가 확정
          </label>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">비용 안내 (선택)</label>
            <input
              type="text"
              value={feeNote}
              onChange={(e) => setFeeNote(e.target.value)}
              className="input w-full"
              placeholder="참가비 없음, 현장 음료 자부담 등"
            />
          </div>

          {mode === 'offline' ? (
            <div className="space-y-4 border-t border-[#e5e5e5] pt-4">
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">장소명</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="input w-full"
                  placeholder="위워크 강남"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">주소</label>
                <input
                  type="text"
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  className="input w-full"
                  placeholder="서울 ..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">지도 URL (선택)</label>
                <input
                  type="url"
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  className="input w-full"
                  placeholder="https://map.naver.com/..."
                />
              </div>
            </div>
          ) : (
            <div className="border-t border-[#e5e5e5] pt-4">
              <label className="block text-sm font-medium text-[#333] mb-2">미팅 URL</label>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="input w-full"
                placeholder="https://zoom.us/j/..."
              />
              <p className="text-xs text-[#888] mt-1">
                링크는 확정된 참가자와 호스트에게만 표시됩니다.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '모임 만들기'}
            </button>
            <Link href="/meetups" className="btn btn-secondary">
              취소
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}