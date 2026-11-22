'use client'

import { useState } from 'react'
import { User, Lock, Plus, Ghost } from 'lucide-react'
import type { Member } from '@/lib/supabase/types'
import { UserAvatar } from '@/components/user-avatar'
import { validateNickname, memberHasNicknameProfile } from '@/lib/profile'
import { toast } from 'sonner'

interface ProfileSettingsProps {
  member: Member
  nicknameUnlocked: boolean
  activeMemberCount: number
  unlockThreshold: number
}

export function ProfileSettings({
  member,
  nicknameUnlocked,
  activeMemberCount,
  unlockThreshold,
}: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(member.display_name)
  const [bio, setBio] = useState(member.bio || '')
  const [nickname, setNickname] = useState(member.nickname || '')
  const [nicknameBio, setNicknameBio] = useState(member.nickname_bio || '')
  const hasNick = memberHasNicknameProfile(member)

  return (
    <div className="space-y-6">
        {/* Real-name profile (default) */}
        <section className="card">
          <div className="p-4 border-b border-[#e5e5e5]">
            <h2 className="font-semibold text-[#111] flex items-center gap-2">
              <User className="w-4 h-4" />
              실명 프로필
            </h2>
            <p className="text-xs text-[#888] mt-0.5">기본 프로필 · 이메일은 다른 멤버에게 보이지 않습니다</p>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <UserAvatar id={member.id} name={displayName} avatarUrl={member.avatar_url} size="lg" />
              <button className="btn btn-secondary btn-sm">아바타 변경</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">이메일</label>
              <input type="email" value={member.email} disabled className="input bg-[#f7f7f7] text-[#666]" />
              <p className="text-xs text-[#888] mt-1">본인만 확인 가능 · 피드/게시물에 노출되지 않음</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">표시 이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2">소개</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="input resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => toast.success('실명 프로필이 저장되었습니다.')}
                className="btn btn-primary"
              >
                저장
              </button>
            </div>
          </div>
        </section>

        {/* Nickname profile */}
        <section className="card">
          <div className="p-4 border-b border-[#e5e5e5]">
            <h2 className="font-semibold text-[#111] flex items-center gap-2">
              <Ghost className="w-4 h-4" />
              별명 프로필
            </h2>
            <p className="text-xs text-[#888] mt-0.5">
              언락 후 게시물마다 실명/별명을 선택할 수 있습니다
            </p>
          </div>

          {!nicknameUnlocked ? (
            <div className="p-6 text-center">
              <Lock className="w-8 h-8 mx-auto mb-3 text-[#ccc]" />
              <p className="font-medium text-[#333]">
                멤버 {unlockThreshold}명부터 별명 프로필 오픈
              </p>
              <p className="text-sm text-[#888] mt-1">
                현재 활성 멤버 <span className="font-semibold text-[#111]">{activeMemberCount}</span>명
              </p>
              <div className="mt-4 h-2 bg-[#eee] rounded-full overflow-hidden max-w-xs mx-auto">
                <div
                  className="h-full bg-[#111] rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (activeMemberCount / unlockThreshold) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : hasNick ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <UserAvatar
                  id={`nick_${member.id}`}
                  name={member.nickname!}
                  avatarUrl={member.nickname_avatar_url}
                  size="lg"
                />
                <div>
                  <div className="font-semibold text-[#111]">@{member.nickname}</div>
                  <p className="text-xs text-[#888]">별명 게시물에서는 실명과 연결되지 않습니다</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">별명 소개</label>
                <textarea
                  value={nicknameBio}
                  onChange={(e) => setNicknameBio(e.target.value)}
                  rows={2}
                  className="input resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => toast.success('별명 프로필이 저장되었습니다.')}
                  className="btn btn-primary"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <p className="text-sm text-[#555]">
                커뮤니티가 오픈되었습니다. 별명 프로필은 멤버당 1개만 만들 수 있습니다.
              </p>
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">별명 (핸들)</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="input font-mono"
                  placeholder="voidwalker"
                  maxLength={24}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2">소개 (선택)</label>
                <textarea
                  value={nicknameBio}
                  onChange={(e) => setNicknameBio(e.target.value)}
                  rows={2}
                  className="input resize-none"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const v = validateNickname(nickname)
                  if (!v.ok) {
                    toast.error(v.reason)
                    return
                  }
                  toast.success(`@${v.nickname} 별명 프로필이 생성되었습니다.`)
                }}
              >
                <Plus className="w-4 h-4" />
                별명 프로필 만들기
              </button>
            </div>
          )}
        </section>

    </div>
  )
}
