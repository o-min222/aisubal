'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ghost, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { ProfileLink } from '@/lib/profile-rules'
import { validateNickname } from '@/lib/profile'
import { UserAvatar } from '@/components/user-avatar'
import { ProfileForm, type ProfileFormMember } from '@/components/profile/profile-form'
import { LinksEditor } from '@/components/profile/links-editor'

type Nick = { id: string; nickname: string | null; nicknameBio: string | null; nicknameAvatarUrl: string | null; hasNick: boolean }

interface ProfileSettingsProps {
  me: ProfileFormMember
  nick: Nick
  links: ProfileLink[]
  nicknameUnlocked: boolean
  activeMemberCount: number
  unlockThreshold: number
}

export function ProfileSettings({ me, nick, links, nicknameUnlocked, activeMemberCount, unlockThreshold }: ProfileSettingsProps) {
  const router = useRouter()
  const [nickname, setNickname] = useState(nick.nickname || '')
  const [nicknameBio, setNicknameBio] = useState(nick.nicknameBio || '')
  const [busy, setBusy] = useState(false)

  async function saveNick() {
    const v = validateNickname(nick.hasNick ? nick.nickname || '' : nickname)
    if (!v.ok) return toast.error(v.reason)
    setBusy(true)
    try {
      const res = await fetch('/api/profile/nickname', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: v.nickname, bio: nicknameBio }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '저장하지 못했어요.')
      toast.success('부캐 프로필을 저장했어요')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <ProfileForm me={me} mode="settings" />
      <LinksEditor initial={links} />

      <section className="card">
        <div className="p-4 border-b border-[#e5e5e5]">
          <h2 className="font-semibold text-[#111] flex items-center gap-2">
            <Ghost className="w-4 h-4" />
            부캐(별명) 프로필 <span className="text-xs font-normal text-[#888]">선택</span>
          </h2>
          <p className="text-xs text-[#888] mt-0.5">기본 프로필과 연결되지 않는 두 번째 이름. 열리면 글마다 고를 수 있어요.</p>
        </div>

        {!nicknameUnlocked ? (
          <div className="p-6 text-center">
            <Lock className="w-8 h-8 mx-auto mb-3 text-[#ccc]" />
            <p className="font-medium text-[#333]">멤버 {unlockThreshold}명부터 부캐 프로필 오픈</p>
            <p className="text-sm text-[#888] mt-1">
              현재 활성 멤버 <span className="font-semibold text-[#111]">{activeMemberCount}</span>명
            </p>
            <div className="mt-4 h-2 bg-[#eee] rounded-full overflow-hidden max-w-xs mx-auto">
              <div className="h-full bg-[#111] rounded-full transition-all" style={{ width: `${Math.min(100, (activeMemberCount / unlockThreshold) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {nick.hasNick ? (
              <div className="flex items-center gap-3">
                <UserAvatar id={`nick_${nick.id}`} name={nick.nickname!} avatarUrl={nick.nicknameAvatarUrl} size="lg" />
                <div>
                  <div className="font-semibold text-[#111]">{nick.nickname}</div>
                  <p className="text-xs text-[#888]">부캐 글에서는 기본 프로필과 연결되지 않아요</p>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-[#333] mb-2" htmlFor="nick-name">
                  부캐 이름
                </label>
                <input id="nick-name" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="input" placeholder="voidwalker" maxLength={24} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[#333] mb-2" htmlFor="nick-bio">
                부캐 소개
              </label>
              <textarea id="nick-bio" value={nicknameBio} onChange={(e) => setNicknameBio(e.target.value)} rows={2} className="input resize-none" maxLength={160} />
            </div>
            <button className="btn btn-primary" onClick={saveNick} disabled={busy}>
              {!nick.hasNick && <Plus className="w-4 h-4" />}
              {nick.hasNick ? '저장' : '부캐 프로필 만들기'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
