'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, EyeOff, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { normalizeHandle, suggestHandle, validateDisplayName, validateHandle } from '@/lib/profile-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

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
const field = 'w-full rounded-xl border border-n-ddd px-3 py-2.5 text-[15px] bg-n-fff focus:outline-none focus:border-n-111'

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
  // A32: errors show after the first submit (or once a field has content), never a silent no-op
  const [submitted, setSubmitted] = useState(false)
  const [serverName, setServerName] = useState<{ v: string; reason: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<HTMLInputElement>(null)
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

  async function checkHandleNow(h: string): Promise<HandleState> {
    try {
      const d = await (await fetch(`/api/profile/handle?h=${encodeURIComponent(h)}`)).json()
      const state: HandleState = d.available ? { status: 'ok' } : { status: 'bad', reason: d.reason || tx('이미 쓰는 핸들이에요.') }
      setRemote({ h, state })
      return state
    } catch {
      return { status: 'idle' } // the server checks again on save
    }
  }

  useEffect(() => {
    if (!needsRemote) return
    const h = normHandle
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/handle?h=${encodeURIComponent(h)}`)
        const d = await res.json()
        setRemote({ h, state: d.available ? { status: 'ok' } : { status: 'bad', reason: d.reason || tx('이미 쓰는 핸들이에요.') } })
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
      if (!res.ok) throw new Error(d.error || tx('업로드하지 못했어요.'))
      setAvatar(d.url)
      setPreview(d.url)
      setAvatarChosen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('업로드하지 못했어요.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const nameCheck = validateDisplayName(displayName)
  const nameError = serverName && serverName.v === displayName
    ? serverName.reason
    : !nameCheck.ok && (displayName || submitted)
      ? displayName.trim() ? tx(nameCheck.reason) : tx('닉네임을 입력해 주세요.')
      : null
  const handleError = hs.status === 'bad' ? (hs.reason ? tx(hs.reason) : tx('사용할 수 없는 핸들이에요.')) : submitted && !normHandle ? tx('핸들을 입력해 주세요.') : null

  function focusInvalid(el: HTMLElement | null, message: string) {
    toast.error(message)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (uploading) {
      toast.message(tn('사진을 올리는 중이에요. 잠시 후 다시 눌러 주세요.'))
      return
    }
    setSubmitted(true)
    // validate on submit: inline errors + scroll/focus the first one + a toast
    if (!nameCheck.ok) return focusInvalid(nameRef.current, displayName.trim() ? tx(nameCheck.reason) : tx('닉네임을 입력해 주세요.'))
    if (!normHandle) return focusInvalid(handleRef.current, tx('핸들을 입력해 주세요.'))
    const handleState = hs.status === 'checking' ? await checkHandleNow(normHandle) : hs
    if (handleState.status === 'bad') return focusInvalid(handleRef.current, handleState.reason ? tx(handleState.reason) : tx('사용할 수 없는 핸들이에요.'))
    // no avatar picked: start with the default avatar already shown in the preview (the initial circle)
    const avatarToSave = avatarChosen ? avatar : preview ? 'keep' : 'none'
    setBusy(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: normalizeHandle(handle), displayName, bio, avatar: avatarToSave, showRealName: showReal }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (d.field === 'handle') {
          setRemote({ h: normHandle, state: { status: 'bad', reason: d.error } })
          return focusInvalid(handleRef.current, d.error || tx('사용할 수 없는 핸들이에요.'))
        }
        if (d.field === 'displayName') {
          setServerName({ v: displayName, reason: d.error })
          return focusInvalid(nameRef.current, d.error || tx('닉네임을 확인해 주세요.'))
        }
        throw new Error(d.error || tn('저장하지 못했어요.'))
      }
      toast.success(mode === 'onboarding' ? tx('@{handle} 님, 환영해요!', { handle: d.handle }) : tx('프로필을 저장했어요'))
      if (mode === 'onboarding') router.replace('/pledge?from=signup')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="card p-4 space-y-3" aria-label={tx('아바타')}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar id={me.id} name={displayName || '?'} avatarUrl={preview} size="lg" />
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-n-fff/70">
                <Loader2 className="w-5 h-5 animate-spin" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}><T s="아바타 {v}" vars={{ v: mode === 'onboarding' && <span className="text-c-b42318">*</span> }} /></p>
            <p className="text-[12px] text-n-777"><T>직접 고른 사진이나 기본 아바타가 프로필이 돼요. 구글 사진은 고르지 않으면 쓰지 않아요.</T></p>
            {mode === 'onboarding' && !avatarChosen && !preview && <p className="text-[12px] text-n-888 mt-0.5"><T>고르지 않으면 지금 보이는 기본 아바타로 시작해요.</T></p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" id="avatar-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <label htmlFor="avatar-file" className="btn btn-secondary btn-sm min-h-[40px] rounded-full cursor-pointer">
            <Camera className="w-4 h-4" /> <T>사진 올리기</T>
          </label>
          <button
            type="button"
            className="btn btn-sm min-h-[40px] rounded-full"
            aria-pressed={avatarChosen && avatar === 'none'}
            style={avatarChosen && avatar === 'none' ? { border: '2px solid var(--n-111)' } : { border: '1px solid var(--n-ddd)' }}
            onClick={() => {
              setAvatar('none')
              setPreview(null)
              setAvatarChosen(true)
            }}
          >
            <T>기본 아바타</T>
          </button>
          {me.googleAvatarUrl && (
            <button
              type="button"
              className="btn btn-sm min-h-[40px] rounded-full"
              style={avatar === 'google' ? { border: '2px solid var(--n-111)' } : { border: '1px solid var(--n-ddd)' }}
              onClick={() => {
                setAvatar('google')
                setPreview(me.googleAvatarUrl)
                setAvatarChosen(true)
              }}
            >
              <T>구글 사진 쓰기</T>
            </button>
          )}
        </div>
      </section>

      <section className="card p-4 space-y-3" aria-label={tx('이름과 핸들')}>
        <div>
          <label htmlFor="pf-name" className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
            <T>닉네임</T> <span className="text-c-b42318">*</span>
          </label>
          <input
            id="pf-name"
            ref={nameRef}
            className={`${field} ${nameError ? '!border-c-b42318' : ''}`}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'pf-name-error' : undefined}
            value={displayName}
            maxLength={24}
            placeholder={tx('커뮤니티에서 불릴 이름')}
            autoComplete="off"
            onChange={(e) => {
              setDisplayName(e.target.value)
              if (!handleTouched) setHandle(suggestHandle(e.target.value))
            }}
          />
          {nameError && <p id="pf-name-error" className="text-[12px] text-c-b42318 mt-1">{nameError}</p>}
          {mode === 'onboarding' && me.privateRealName && (
            <p className="text-[12px] text-n-888 mt-1">
              <T>구글 이름은 공개되지 않아요.</T>{' '}
              <button type="button" className="text-link" onClick={() => setDisplayName(me.privateRealName || '')}>
                <T>그래도 구글 이름을 닉네임으로 쓰기</T>
              </button>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pf-handle" className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
            <T>핸들</T> <span className="text-c-b42318">*</span> <span className="font-normal text-n-888"><T>(@멘션·모임 명단에 쓰여요)</T></span>
          </label>
          <div className={`flex items-center gap-1 rounded-xl border bg-n-fff px-3 focus-within:border-n-111 ${handleError ? 'border-c-b42318' : 'border-n-ddd'}`}>
            <span className="text-[15px] text-n-999">@</span>
            <input
              id="pf-handle"
              ref={handleRef}
              aria-invalid={handleError ? true : undefined}
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
              {hs.status === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-n-999" />}
              {hs.status === 'ok' && <Check className="w-4 h-4 text-c-1f7a4d" aria-label={tx('사용 가능')} />}
              {hs.status === 'bad' && <X className="w-4 h-4 text-c-b42318" aria-label={tx('사용 불가')} />}
            </span>
          </div>
          {handleError && <p className="text-[12px] text-c-b42318 mt-1" role="alert">{handleError}</p>}
          {hs.status === 'ok' && handle && <p className="text-[12px] text-c-1f7a4d mt-1"><T s="{handle} 사용할 수 있어요" vars={{ handle: '@' + normalizeHandle(handle) }} /></p>}
        </div>
        <div>
          <label htmlFor="pf-bio" className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
            <T>소개</T> <span className="font-normal text-n-888"><T>(선택, 160자)</T></span>
          </label>
          <textarea id="pf-bio" className={field} rows={2} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={tx('요즘 쓰는 AI, 만드는 것, 관심사')} />
        </div>
      </section>

      <section className="card p-4 space-y-2" aria-label={tx('실명 공개')}>
        <div className="flex items-start gap-3">
          <EyeOff className="w-4 h-4 mt-0.5 flex-shrink-0 text-n-777" />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}>
              <T>실명은 기본으로 비공개예요</T>
            </p>
            <p className="text-[12px] text-n-777">
              <T>이메일과 구글 계정 정보는 다른 멤버·AI 에이전트에게 절대 보이지 않아요. 원하면 실명만 프로필에 함께 보여줄 수 있어요.</T>
            </p>
          </div>
        </div>
        {me.privateRealName ? (
          <div className="flex items-center justify-between gap-3 rounded-xl px-3 min-h-[48px]" style={{ background: 'var(--n-fafafa)' }}>
            <span className="text-[13.5px]" style={{ color: 'var(--n-333)' }}>
              <T>프로필에 실명 표시</T> <span className="text-n-999"><T s="({privateRealName} · 나만 보여요)" vars={{ privateRealName: me.privateRealName }} /></span>
            </span>
            <ToggleSwitch checked={showReal} onChange={setShowReal} label={tx('프로필에 실명 표시')} />
          </div>
        ) : (
          <p className="text-[12px] text-n-999"><T>구글 계정에 이름이 없어 실명 표시를 켤 수 없어요.</T></p>
        )}
      </section>

      <button type="submit" disabled={busy} aria-busy={busy || uploading} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
        {busy ? <T>저장 중…</T> : mode === 'onboarding' ? <T>이 프로필로 시작하기</T> : <T>프로필 저장</T>}
      </button>
    </form>
  )
}
