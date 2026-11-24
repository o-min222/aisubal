'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Camera, Check, ChevronLeft, ChevronRight, GripVertical, Link2, Loader2, Lock, Plus, Users, Bot, Eye, X } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { ServiceIcon } from '@/components/service-chip'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LinksEditor } from '@/components/profile/links-editor'
import { HandleField } from '@/components/profile/handle-field'
import { LinkIcon } from '@/components/profile/link-icon'
import { Picker, type Item, type StackEditorInitial } from '@/components/profile/stack-editor'
import type { ProfileFormMember } from '@/components/profile/profile-form'
import { LINK_KINDS, LINK_VISIBILITY, normalizeHandle, validateDisplayName, validateHandle, type ProfileLink } from '@/lib/profile-rules'
import { AI_SUGGESTIONS, STACK_GROUP_LABEL, STACK_LIMIT, SUB_SUGGESTIONS, moveItem, skillsPayload, type StackGroup } from '@/lib/profile-stack'
import { useDragSort } from '@/hooks/use-drag-sort'
import { piiWarning } from '@/lib/pii'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-·.]+/g, '')
const VIS_ICON = { members: Eye, friends: Users, private: Lock } as const

export type ProfileEditorAgent = { id: string; name: string; client: string | null; avatarUrl?: string | null; brand?: string | null }

/**
 * WYSIWYG profile: the card others see, edited in place. Every field autosaves
 * (name/handle/bio on blur, chips on change) with one small saved indicator.
 * Chips: tap → ‹ › (move) and × (remove); drag to reorder with a mouse (A90); '+' → picker sheet.
 */
export function ProfileCardEditor({
  me,
  stack,
  links,
  agents,
  settingsRows = true,
}: {
  me: ProfileFormMember
  stack: StackEditorInitial
  links: ProfileLink[]
  agents: ProfileEditorAgent[]
  settingsRows?: boolean
}) {
  const router = useRouter()
  const [save, setSave] = useState<SaveState>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mark = (s: SaveState) => {
    setSave(s)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    if (s === 'saved') savedTimer.current = setTimeout(() => setSave('idle'), 2200)
  }

  // ---- identity (POST /api/profile, whole record each time) ----
  const [name, setName] = useState(me.isPlaceholderName ? '' : me.displayName)
  const [handle, setHandle] = useState(me.handle ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [showReal, setShowReal] = useState(me.showRealName)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl)
  const [handleErr, setHandleErr] = useState<string | null>(null)
  const last = useRef({ name, handle: normalizeHandle(handle), bio, showReal })

  async function saveProfile(patch: Partial<{ name: string; handle: string; bio: string; showReal: boolean; avatar: string }> = {}) {
    // the handle is changed only through HandleField (policy + confirm); keep the saved one here
    const next = { name, handle: last.current.handle || normalizeHandle(handle), bio, showReal, ...patch }
    if (next.handle) next.handle = normalizeHandle(next.handle)
    const nameOk = validateDisplayName(next.name)
    if (!nameOk.ok) return toast.error(nameOk.reason)
    const h = validateHandle(next.handle)
    if (!h.ok) return setHandleErr(h.reason)
    if (!patch.avatar && next.name === last.current.name && next.handle === last.current.handle && next.bio === last.current.bio && next.showReal === last.current.showReal) return
    mark('saving')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: next.handle, displayName: next.name, bio: next.bio, avatar: patch.avatar ?? 'keep', showRealName: next.showReal }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (d.field === 'handle') setHandleErr(d.error)
        throw new Error(d.error || '저장하지 못했어요.')
      }
      last.current = { name: next.name, handle: next.handle, bio: next.bio, showReal: next.showReal }
      setHandleErr(null)
      mark('saved')
      router.refresh()
    } catch (e) {
      mark('error')
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    }
  }

  // ---- avatar sheet ----
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  async function onFile(f: File | undefined) {
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || '업로드하지 못했어요.')
      setAvatarUrl(d.url)
      setAvatarOpen(false)
      await saveProfile({ avatar: d.url })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('업로드하지 못했어요.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  async function pickAvatar(kind: 'none' | 'google') {
    setAvatarUrl(kind === 'google' ? me.googleAvatarUrl : null)
    setAvatarOpen(false)
    await saveProfile({ avatar: kind })
  }

  // ---- stack chips (PUT /api/profile/stack on every change) ----
  // A90: every group is one ordered list; skills mixes '사용 중' tools (used) and free-text extras
  const [groups, setGroups] = useState<Record<StackGroup, Item[]>>({
    ai: stack.ai,
    subs: stack.subs,
    skills: stack.skills ?? [...stack.usedSkills.map((i) => ({ ...i, used: true })), ...stack.skillExtras.map((label) => ({ label, entryId: null }))],
  })
  const [vis, setVis] = useState(stack.vis)
  const [adding, setAdding] = useState<StackGroup | null>(null)
  // A41: tap a chip → an inline × appears; tap × deletes; tap elsewhere / the chip again hides it
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    // pointerdown + touchstart: iOS Safari fires no click on non-interactive areas
    const close = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[data-pe-chip]')) setArmed(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmed(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('touchstart', close, { passive: true })
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('touchstart', close); document.removeEventListener('keydown', esc) }
  }, [armed])

  async function putStack(nextGroups = groups, nextVis = vis) {
    mark('saving')
    try {
      const strip = (l: Item[]) => l.map(({ label, entryId }) => ({ label, entryId }))
      const res = await fetch('/api/profile/stack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: strip(nextGroups.ai), subs: strip(nextGroups.subs), skills: skillsPayload(nextGroups.skills), vis: nextVis }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '저장하지 못했어요.')
      mark('saved')
      router.refresh()
    } catch (e) {
      mark('error')
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    }
  }
  function setGroup(g: StackGroup, items: Item[]) {
    const next = { ...groups, [g]: items }
    setGroups(next)
    void putStack(next)
  }
  function addItem(g: StackGroup, i: Item) {
    const list = groups[g]
    if (list.length >= STACK_LIMIT) return toast.error(tn('{n}개까지 추가할 수 있어요.', { n: STACK_LIMIT }))
    if (list.some((x) => (i.entryId && x.entryId === i.entryId) || norm(x.label) === norm(i.label))) return
    setGroup(g, [...list, { ...i, visibility: null }])
  }
  // A90: reorder — live while dragging, saved once on drop; ‹ › save right away
  const latest = useRef(groups)
  useEffect(() => { latest.current = groups }, [groups])
  const moveLocal = (g: StackGroup) => (from: number, to: number) => setGroups((cur) => ({ ...cur, [g]: moveItem(cur[g], from, to) }))
  const commit = () => void putStack(latest.current)
  const sorters = {
    ai: useDragSort('pe-ai', moveLocal('ai'), commit),
    subs: useDragSort('pe-subs', moveLocal('subs'), commit),
    skills: useDragSort('pe-skills', moveLocal('skills'), commit),
  }
  function step(g: StackGroup, idx: number, d: -1 | 1) {
    const list = groups[g]
    const next = moveItem(list, idx, idx + d)
    if (next === list) return
    const it = list[idx]
    setArmed(`${g}-${it.label}`)
    setGroup(g, next)
  }
  async function toggleUsage(item: Item, using: boolean) {
    if (!item.entryId) return
    mark('saving')
    const res = await fetch(`/api/tools/${item.entryId}/usage`, { method: using ? 'POST' : 'DELETE' })
    if (!res.ok) {
      mark('error')
      return toast.error(tn('사용 중 표시를 바꾸지 못했어요.'))
    }
    // the new tool keeps the spot it was given (end of the row); the order is saved with the row
    const rest = groups.skills.filter((u) => u.entryId !== item.entryId)
    const next = { ...groups, skills: using ? [...rest, { ...item, used: true }] : rest }
    setGroups(next)
    await putStack(next)
  }

  const [linksOpen, setLinksOpen] = useState(false)
  const [realOpen, setRealOpen] = useState(false)
  const bioPii = piiWarning(bio)

  const group = (g: StackGroup) => {
    const list = groups[g]
    const sort = sorters[g]
    const GIcon = VIS_ICON[vis[g]]
    return (
      <div className="mc-group">
        <div className="mc-group-label">
          <T>{STACK_GROUP_LABEL[g]}</T>
          <DropdownMenu>
            <DropdownMenuTrigger className="pe-vis" aria-label={tx('{label} 공개 범위', { label: tx(STACK_GROUP_LABEL[g]) })}>
              <GIcon className="w-3 h-3" /> <T>{LINK_VISIBILITY.find((v) => v.id === vis[g])!.label}</T>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuLabel><T>이 묶음을 볼 수 있는 사람</T></DropdownMenuLabel>
              {LINK_VISIBILITY.map((v) => {
                const I = VIS_ICON[v.id]
                return (
                  <DropdownMenuItem key={v.id} onClick={() => { const nv = { ...vis, [g]: v.id }; setVis(nv); void putStack(groups, nv) }}>
                    <I className="w-4 h-4" /> <T>{v.label}</T>
                    {vis[g] === v.id && <Check className="w-4 h-4 ml-auto" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ul className="mc-chips">
          {list.map((it, idx) => {
            const key = `${g}-${it.label}`
            const on = armed === key
            return (
              <li key={key} {...sort.item(idx)} className={sort.dragIdx === idx ? 'pe-dragging' : undefined}>
                <span className={`mc-chip pe-chip${on ? ' on' : ''}`} data-pe-chip={on ? '' : undefined}>
                  {list.length > 1 && <GripVertical className="pe-grip" aria-hidden />}
                  <button type="button" className="pe-chip-btn" aria-expanded={on} onClick={() => !sort.wasDrag() && setArmed(on ? null : key)} aria-label={tx('{label} 편집 버튼 보기', { label: it.label })}>
                    <ServiceIcon label={it.label} iconUrl={it.iconUrl} />
                    <span className="svc-label">{it.label}</span>
                  </button>
                  {on && list.length > 1 && (
                    <>
                      <button type="button" className="pe-chip-move" disabled={idx === 0} aria-label={tx('{label} 앞으로', { label: it.label })} onClick={() => step(g, idx, -1)}>
                        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.25} />
                      </button>
                      <button type="button" className="pe-chip-move" disabled={idx === list.length - 1} aria-label={tx('{label} 뒤로', { label: it.label })} onClick={() => step(g, idx, 1)}>
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.25} />
                      </button>
                    </>
                  )}
                  {on && (
                    <button
                      type="button"
                      className="pe-chip-x"
                      autoFocus
                      aria-label={tx('{label} 삭제', { label: it.label })}
                      onClick={() => {
                        setArmed(null)
                        if (g === 'skills' && it.used) void toggleUsage(it, false)
                        else setGroup(g, list.filter((_, j) => j !== idx))
                      }}
                    >
                      <X className="w-3 h-3" strokeWidth={2.25} />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
          <li>
            <button type="button" className="mc-chip pe-add" onClick={() => setAdding(g)} aria-label={tx('{label} 추가', { label: tx(STACK_GROUP_LABEL[g]) })}>
              <Plus className="w-3.5 h-3.5" /> <T>추가</T>
            </button>
          </li>
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-3 min-w-0">
      <section className="profile-card member-card pe-card" aria-label={tx('내 프로필 편집')}>
        <div className="profile-card-cover" aria-hidden />
        <div className="pe-status" role="status" aria-live="polite">
          {save === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> <T>저장 중…</T></>}
          {save === 'saved' && <><Check className="w-3.5 h-3.5" /> <T>저장됨</T></>}
          {save === 'error' && <T>저장 안 됨</T>}
        </div>
        <div className="px-4 pb-4 -mt-8">
          <button type="button" className="pe-avatar" onClick={() => setAvatarOpen(true)} aria-label={tx('아바타 바꾸기')}>
            <UserAvatar id={me.id} name={name || '?'} avatarUrl={avatarUrl} size="lg" />
            <span className="pe-avatar-cam">{uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}</span>
          </button>
          <input
            className="pe-inline pe-name"
            value={name}
            maxLength={24}
            placeholder={tx('닉네임')}
            aria-label={tx('닉네임')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveProfile()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <HandleField initial={me.handle ?? ''} onChanged={(h) => { setHandle(h); setHandleErr(null); last.current = { ...last.current, handle: h } }} />
          {handleErr && <p role="alert" className="text-[12px] mt-1 px-0.5 text-c-b42318">{tx(handleErr)}</p>}
          <textarea
            className="pe-inline pe-bio"
            value={bio}
            maxLength={160}
            rows={2}
            placeholder={tx('한 줄 소개를 써 보세요')}
            aria-label={tx('소개')}
            onChange={(e) => setBio(e.target.value)}
            onBlur={() => void saveProfile()}
          />
          {bioPii && <p role="alert" className="pii-warning text-[12px] rounded-lg px-2.5 py-1.5 mt-1" style={{ background: 'var(--c-fff4e5)', color: 'var(--c-8a4b00)' }}><T s="{pii} 멤버 모두가 볼 수 있어요. 지우거나 가려주세요." vars={{ pii: bioPii }} /></p>}

          <div className="mc-body">
            {group('ai')}
            {group('subs')}
            {group('skills')}
            <div className="mc-group">
              <div className="mc-group-label"><T>SNS 링크</T></div>
              <ul className="mc-chips">
                {links.map((l, i) => (
                  <li key={`${l.kind}-${i}`}>
                    <button type="button" className="mc-chip pe-chip" onClick={() => setLinksOpen(true)}>
                      <LinkIcon kind={l.kind} size={16} />
                      <span className="truncate"><T>{LINK_KINDS.find((k) => k.kind === l.kind)?.label ?? l.kind}</T></span>
                      {l.visibility !== 'members' && <Lock className="w-3 h-3 text-n-999" />}
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="mc-chip pe-add" onClick={() => setLinksOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> <T>추가</T>
                  </button>
                </li>
              </ul>
            </div>
            <div className="mc-group">
              <div className="mc-group-label"><T>에이전트</T></div>
              {agents.length ? (
                <ul className="mc-chips">
                  {agents.map((a) => (
                    <li key={a.id}><span className="mc-chip"><AgentAvatar name={a.name} brand={a.brand} avatarUrl={a.avatarUrl} size={16} /> <span className="truncate">{a.name}</span></span></li>
                  ))}
                </ul>
              ) : null}
              <Link href="/agents" className="pe-agents-link">
                {agents.length ? <T>내 에이전트에서 관리</T> : <T>연결한 에이전트 중 ‘프로필에 보이기’로 둔 것이 여기에 나와요</T>} <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {settingsRows && (
        <section className="ios-rows" aria-label={tx('프로필 설정')}>
          <button type="button" className="ios-row" onClick={() => setRealOpen(true)}>
            <Eye className="w-4 h-4 text-n-666" />
            <span className="flex-1 min-w-0"><T>실명 공개</T></span>
            <span className="ios-row-val">{showReal ? <T>공개</T> : <T>비공개</T>}</span>
            <ChevronRight className="w-4 h-4 text-n-bbb" />
          </button>
          <Link href="/agents" className="ios-row">
            <Bot className="w-4 h-4 text-n-666" />
            <span className="flex-1 min-w-0"><T>내 에이전트</T></span>
            <span className="ios-row-val">{agents.length || ''}</span>
            <ChevronRight className="w-4 h-4 text-n-bbb" />
          </Link>
          <Link href="/members/me?preview=1" className="ios-row">
            <Link2 className="w-4 h-4 text-n-666" />
            <span className="flex-1 min-w-0"><T>다른 사람에게 보이는 모습</T></span>
            <ChevronRight className="w-4 h-4 text-n-bbb" />
          </Link>
        </section>
      )}

      <AdaptiveSheet open={avatarOpen} onOpenChange={setAvatarOpen} title={tx('아바타')}>
        <div className="flex flex-col gap-1 pb-1">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" id="pe-avatar-file" onChange={(e) => void onFile(e.target.files?.[0])} />
          <label htmlFor="pe-avatar-file" className="sheet-row cursor-pointer"><Camera className="w-5 h-5" /> <T>사진 올리기</T></label>
          {me.googleAvatarUrl && <button type="button" className="sheet-row" onClick={() => void pickAvatar('google')}><UserAvatar id={me.id} name={name} avatarUrl={me.googleAvatarUrl} size="sm" /> <T>구글 사진 쓰기</T></button>}
          <button type="button" className="sheet-row" onClick={() => void pickAvatar('none')}><UserAvatar id={me.id} name={name || '?'} avatarUrl={null} size="sm" /> <T>기본 아바타</T></button>
        </div>
      </AdaptiveSheet>

      <AdaptiveSheet open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} title={adding ? tx('{label} 추가', { label: tx(STACK_GROUP_LABEL[adding]) }) : ''}>
        {adding && (
          <div className="pb-1">
            <Picker
              key={adding}
              inline
              taken={groups[adding].map((i) => i.label)}
              skillsOnly={adding === 'skills'}
              suggestions={adding === 'ai' ? AI_SUGGESTIONS : adding === 'subs' ? SUB_SUGGESTIONS : []}
              placeholder={adding === 'skills' ? tx('스킬·플러그인·MCP 검색') : adding === 'ai' ? tx('AI 검색 또는 직접 입력') : tx('구독 서비스 검색 또는 직접 입력')}
              onPick={(i) => {
                if (adding === 'skills' && i.entryId) void toggleUsage(i, true)
                else addItem(adding, i)
                setAdding(null)
              }}
            />
            <p className="text-[12px] text-n-888 mt-2">{adding === 'skills' ? <T>갤러리에서 고르면 ‘사용 중’으로 바로 표시돼요. 목록에 없으면 직접 입력.</T> : <T>목록에 없으면 직접 입력하고 Enter.</T>}</p>
          </div>
        )}
      </AdaptiveSheet>

      <AdaptiveSheet open={linksOpen} onOpenChange={setLinksOpen} title={tx('SNS 링크')} className="sm:!max-w-lg">
        <LinksEditor initial={links} />
      </AdaptiveSheet>

      <AdaptiveSheet open={realOpen} onOpenChange={setRealOpen} title={tx('실명 공개')}>
        <div className="space-y-3 pb-1">
          <p className="text-[13px] text-n-666"><T>켜면 프로필에 실명이 함께 보여요. 기본은 비공개예요.</T></p>
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              className="sheet-row w-full"
              onClick={() => {
                setShowReal(v)
                setRealOpen(false)
                void saveProfile({ showReal: v })
              }}
            >
              <span className="flex-1"><T>{v ? '실명 공개' : '비공개 (닉네임만)'}</T></span>
              {showReal === v && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </AdaptiveSheet>
    </div>
  )
}
