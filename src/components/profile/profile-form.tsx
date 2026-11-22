'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, EyeOff, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { normalizeHandle, suggestHandle, validateDisplayName, validateHandle } from '@/lib/profile-rules'

export type ProfileFormMember = {
  id: string
  handle: string | null
  displayName: string
  bio: string | null
  avatarUrl: string | null
  showRealName: boolean
  /** owner-only private prefill; never rendered to anyone else */
  privateRealName: string | null
  googleAvatarUrl: string | null
  isPlaceholderName: boolean
}

type HandleState = { status: 'idle' | 'checking' | 'ok' | 'bad'; reason?: string | null }
const field = 'w-full rounded-xl border border-[#ddd] px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:border-[#111]'

export function ProfileForm({ me, mode }: { me: ProfileFormMember; mode: 'onboarding' | 'settings' }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(me.isPlaceholderName ? '' : me.displayName)
  const [handle, setHandle] = useState(me.handle ?? '')
  const [handleTouched, setHandleTouched] = useState(Boolean(me.handle))
  const [bio, setBio] = useState(me.bio ?? '')
  const [avatar, setAvatar] = useState<string>('keep')
  const [preview, setPreview] = useState<string | null>(me.avatarUrl)
  const [avatarChosen, setAvatarChosen] = useState(Boolean(me.avatarUrl) || mode === 'settings')
  const [showReal, setShowReal] = useState(me.showRealName)
  // Server answers are keyed by the handle they were for; local checks are derived during render.
  const [remote, setRemote] = useState<{ h: string; state: HandleState } | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const normHandle = normalizeHandle(handle)
  const localCheck = validateHandle(normHandle)
  const needsRemote = Boolean(normHandle) && localCheck.ok && normHandle !== me.handle
  const hs: HandleState = !normHandle
    ? { status: 'idle' }
    : !localCheck.ok
      ? { status: 'bad', reason: localCheck.reason }
      : normHandle === me.handle
        ? { status: 'ok' }
        : remote?.h === normHandle
          ? remote.state
          : { status: 'checking' }

  useEffect(() => {
    if (!needsRemote) return
    const h = normHandle
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/handle?h=${encodeURIComponent(h)}`)
        const d = await res.json()
        setRemote({ h, state: d.available ? { status: 'ok' } : { status: 'bad', reason: d.reason || '이미 쓰는 핸들이에요.' } })
      } catch {
        setRemote({ h, state: { status: 'idle' } })
      }
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [needsRemote, normHandle])

  async function onFile(f: File | undefined) {
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || '업로드하지 못했어요.')
      setAvatar(d.url)
      setPreview(d.url)
      setAvatarChosen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드하지 못했어요.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const nameCheck = validateDisplayName(displayName)
  const canSubmit = nameCheck.ok && hs.status === 'ok' && avatarChosen && !busy && !uploading

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: normalizeHandle(handle), displayName, bio, avatar, showRealName: showReal }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (d.field === 'handle') setRemote({ h: normHandle, state: { status: 'bad', reason: d.error } })
        throw new Error(d.error || '저장하지 못했어요.')
      }
      toast.success(mode === 'onboarding' ? `@${d.handle} 님, 환영해요!` : '프로필을 저장했어요')
      if (mode === 'onboarding') router.replace('/feed')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="card p-4 space-y-3" aria-label="아바타">
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar id={me.id} name={displayName || '?'} avatarUrl={preview} size="lg" />
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
                <Loader2 className="w-5 h-5 animate-spin" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: '#111' }}>
              아바타 {mode === 'onboarding' && <span className="text-[#b42318]">*</span>}
            </p>
            <p className="text-[12px] text-[#777]">직접 고른 사진이나 기본 아바타가 프로필이 돼요. 구글 사진은 고르지 않으면 쓰지 않아요.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" id="avatar-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <label htmlFor="avatar-file" className="btn btn-secondary btn-sm min-h-[40px] rounded-full cursor-pointer">
            <Camera className="w-4 h-4" /> 사진 올리기
          </label>
          <button
            type="button"
            className="btn btn-sm min-h-[40px] rounded-full"
            style={avatarChosen && avatar === 'none' ? { border: '2px solid #111' } : { border: '1px solid #ddd' }}
            onClick={() => {
              setAvatar('none')
              setPreview(null)
              setAvatarChosen(true)
            }}
          >
            기본 아바타
          </button>
          {me.googleAvatarUrl && (
            <button
              type="button"
              className="btn btn-sm min-h-[40px] rounded-full"
              style={avatar === 'google' ? { border: '2px solid #111' } : { border: '1px solid #ddd' }}
              onClick={() => {
                setAvatar('google')
                setPreview(me.googleAvatarUrl)
                setAvatarChosen(true)
              }}
            >
              구글 사진 쓰기
            </button>
          )}
        </div>
      </section>

      <section className="card p-4 space-y-3" aria-label="이름과 핸들">
        <div>
          <label htmlFor="pf-name" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            닉네임 <span className="text-[#b42318]">*</span>
          </label>
          <input
            id="pf-name"
            className={field}
            value={displayName}
            maxLength={24}
            placeholder="커뮤니티에서 불릴 이름"
            autoComplete="off"
            onChange={(e) => {
              setDisplayName(e.target.value)
              if (!handleTouched) setHandle(suggestHandle(e.target.value))
            }}
          />
          {displayName && !nameCheck.ok && <p className="text-[12px] text-[#b42318] mt-1">{nameCheck.reason}</p>}
          {mode === 'onboarding' && me.privateRealName && (
            <p className="text-[12px] text-[#888] mt-1">
              구글 이름은 공개되지 않아요.{' '}
              <button type="button" className="underline" onClick={() => setDisplayName(me.privateRealName || '')}>
                그래도 구글 이름을 닉네임으로 쓰기
              </button>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pf-handle" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            핸들 <span className="text-[#b42318]">*</span> <span className="font-normal text-[#888]">(@멘션·모임 명단에 쓰여요)</span>
          </label>
          <div className="flex items-center gap-1 rounded-xl border border-[#ddd] bg-white px-3 focus-within:border-[#111]">
            <span className="text-[15px] text-[#999]">@</span>
            <input
              id="pf-handle"
              className="flex-1 py-2.5 text-[15px] bg-transparent focus:outline-none"
              value={handle}
              maxLength={21}
              placeholder="my_handle"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setHandleTouched(true)
                setHandle(e.target.value.toLowerCase().replace(/^@/, ''))
              }}
              aria-describedby="pf-handle-state"
            />
            <span id="pf-handle-state" aria-live="polite" className="flex-shrink-0">
              {hs.status === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-[#999]" />}
              {hs.status === 'ok' && <Check className="w-4 h-4 text-[#1f7a4d]" aria-label="사용 가능" />}
              {hs.status === 'bad' && <X className="w-4 h-4 text-[#b42318]" aria-label="사용 불가" />}
            </span>
          </div>
          {hs.status === 'bad' && <p className="text-[12px] text-[#b42318] mt-1">{hs.reason}</p>}
          {hs.status === 'ok' && handle && <p className="text-[12px] text-[#1f7a4d] mt-1">@{normalizeHandle(handle)} 사용할 수 있어요</p>}
        </div>
        <div>
          <label htmlFor="pf-bio" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            소개 <span className="font-normal text-[#888]">(선택, 160자)</span>
          </label>
          <textarea id="pf-bio" className={field} rows={2} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="요즘 쓰는 AI, 만드는 것, 관심사" />
        </div>
      </section>

      <section className="card p-4 space-y-2" aria-label="실명 공개">
        <div className="flex items-start gap-3">
          <EyeOff className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#777]" />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: '#111' }}>
              실명은 기본으로 비공개예요
            </p>
            <p className="text-[12px] text-[#777]">
              이메일과 구글 계정 정보는 다른 멤버·AI 에이전트에게 절대 보이지 않아요. 원하면 실명만 프로필에 함께 보여줄 수 있어요.
            </p>
          </div>
        </div>
        {me.privateRealName ? (
          <label className="flex items-center justify-between gap-3 rounded-xl px-3 min-h-[48px]" style={{ background: '#fafafa' }}>
            <span className="text-[13.5px]" style={{ color: '#333' }}>
              프로필에 실명 표시 <span className="text-[#999]">({me.privateRealName} · 나만 보여요)</span>
            </span>
            <input type="checkbox" role="switch" checked={showReal} onChange={(e) => setShowReal(e.target.checked)} className="w-5 h-5" />
          </label>
        ) : (
          <p className="text-[12px] text-[#999]">구글 계정에 이름이 없어 실명 표시를 켤 수 없어요.</p>
        )}
      </section>

      <button type="submit" disabled={!canSubmit} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
        {busy ? '저장 중…' : mode === 'onboarding' ? '이 프로필로 시작하기' : '프로필 저장'}
      </button>
      {mode === 'onboarding' && !avatarChosen && <p className="text-center text-[12px] text-[#888]">사진을 올리거나 기본 아바타를 골라주세요.</p>}
    </form>
  )
}
