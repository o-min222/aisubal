'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Clock, HeartHandshake, MoreHorizontal, Search, UserMinus, UserPlus, UserRound, UserX, X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { SocialPerson } from '@/lib/data/social'
import { relationFromRow, type Relation } from '@/lib/social-rules'
import {
  MANAGE_ACTION_LABEL,
  MANAGE_CONFIRM,
  MANAGE_TABS,
  actionRequest,
  inManageTab,
  manageActions,
  matchesPerson,
  predictRelation,
  type ManageAction,
  type ManageTab,
} from '@/lib/social-manage'
import { RelationBadge } from './relation-badge'
import { T } from '@/i18n/t'
import { tn, tx, useT } from '@/i18n/client'
import { msg as M } from '@/i18n/translate'

const DONE: Record<ManageAction, string> = {
  unfriend: M('친구를 끊었어요'),
  cancel_request: M('친구 요청을 취소했어요'),
  request: M('친구 요청을 보냈어요'),
  accept: M('친구가 됐어요'),
  decline: M('요청을 거절했어요'),
  follow: M('팔로우했어요'),
  unfollow: M('팔로우를 취소했어요'),
  remove_follower: M('팔로워에서 삭제했어요'),
}

const ICON: Record<ManageAction, LucideIcon> = {
  unfriend: HeartHandshake,
  cancel_request: Clock,
  request: HeartHandshake,
  accept: Check,
  decline: X,
  follow: UserPlus,
  unfollow: UserMinus,
  remove_follower: UserX,
}

const EMPTY: Record<ManageTab, string> = {
  friends: M('아직 친구가 없어요. 친구는 친구 신청 → 수락으로 생겨요 (맞팔과 별개).'),
  followers: M('아직 팔로워가 없어요.'),
  following: M('아직 팔로우한 사람이 없어요.'),
  requests: M('받은 친구 요청이 없어요.'),
}

/**
 * A48 · 친구·팔로워 관리. One list of people (merged from every tab); which tab a person
 * shows in is derived from the live relation. People you just acted on stay put (with
 * their new state) until you switch tabs, so a mis-tap is one tap to undo.
 */
export function SocialManager({ people: initial, order, initialTab, overflow }: { people: SocialPerson[]; order: Partial<Record<ManageTab, string[]>>; initialTab: ManageTab; overflow: Partial<Record<ManageTab, number>> }) {
  const t = useT()
  const [tab, setTab] = useState<ManageTab>(initialTab)
  const [rel, setRel] = useState<Record<string, Relation>>(() => Object.fromEntries(initial.map((p) => [p.id, p.relation])))
  const [kept, setKept] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c = {} as Record<ManageTab, number>
    for (const { id } of MANAGE_TABS) c[id] = initial.filter((p) => inManageTab(id, rel[p.id])).length + (overflow[id] ?? 0)
    return c
  }, [initial, rel, overflow])
  const incoming = initial.filter((p) => rel[p.id].friend === 'pending_in').length

  // each tab keeps its own server order (newest edge first); people who just joined a tab go last
  const rank = new Map((order[tab] ?? []).map((id, i) => [id, i]))
  const shown = initial
    .filter((p) => (inManageTab(tab, rel[p.id]) || kept.has(p.id)) && matchesPerson(p, q))
    .sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6))
  const received = tab === 'requests' ? shown.filter((p) => rel[p.id].friend === 'pending_in' || (kept.has(p.id) && p.relation.friend === 'pending_in')) : []
  const rest = tab === 'requests' ? shown.filter((p) => !received.includes(p)) : shown

  function pick(next: ManageTab) {
    setTab(next)
    setKept(new Set())
    window.history.replaceState(null, '', `/members/me/social?tab=${next}`)
  }

  async function act(p: SocialPerson, a: ManageAction) {
    if (busy) return
    const ask = MANAGE_CONFIRM[a]
    if (ask && !window.confirm(tn(ask))) return
    const before = rel[p.id]
    setBusy(p.id)
    setKept((s) => new Set(s).add(p.id))
    setRel((m) => ({ ...m, [p.id]: predictRelation(before, a) }))
    try {
      const { url, body } = actionRequest(a, p.id)
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      const server = data.relation as Relation | Record<string, unknown> | undefined
      if (server && 'iFollow' in server) setRel((m) => ({ ...m, [p.id]: server as Relation }))
      else if (server) setRel((m) => ({ ...m, [p.id]: relationFromRow(server as Record<string, unknown>) }))
      toast.success(tx(DONE[a]))
    } catch (err) {
      setRel((m) => ({ ...m, [p.id]: before }))
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }

  function row(p: SocialPerson) {
    const r = rel[p.id]
    const sub = [p.handle ? `@${p.handle}` : '', p.bio].filter(Boolean).join(' · ')
    const menu = manageActions(r)
    const destructive = (a: ManageAction) => a === 'unfriend' || a === 'unfollow' || a === 'remove_follower'
    const safe = menu.filter((a) => !destructive(a))
    const risky = menu.filter(destructive)
    return (
      <li key={p.id} className="sm-row" aria-busy={busy === p.id || undefined}>
        <Link href={`/members/${p.id}`} className="sm-who">
          <UserAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="sm-name-line">
              <span className="sm-name">{p.name}</span>
              <RelationBadge relation={r} />
            </span>
            {sub && <span className="sm-sub">{sub}</span>}
          </span>
        </Link>
        {tab === 'requests' && r.friend === 'pending_in' && (
          <span className="sm-respond">
            <button type="button" className="sm-accept" disabled={busy === p.id} onClick={() => act(p, 'accept')}>
              <Check className="w-3.5 h-3.5" aria-hidden /> <T>수락</T>
            </button>
            <button type="button" className="icon-btn sm-decline" disabled={busy === p.id} onClick={() => act(p, 'decline')} aria-label={tx('친구 요청 거절')} title={tx('거절')}>
              <X className="w-4 h-4" aria-hidden />
            </button>
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="row-menu-btn sm-menu" aria-label={tx('{name} 메뉴', { name: p.name })} disabled={busy === p.id}>
            <MoreHorizontal className="w-5 h-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem render={<Link href={`/members/${p.id}`} />}>
              <UserRound className="w-4 h-4" /> <T>프로필 보기</T>
            </DropdownMenuItem>
            {tab !== 'requests' && r.friend === 'pending_in' && (
              <>
                <DropdownMenuItem onClick={() => act(p, 'accept')}>
                  <Check className="w-4 h-4" /> <T>{MANAGE_ACTION_LABEL.accept}</T>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => act(p, 'decline')}>
                  <X className="w-4 h-4" /> <T>친구 요청 거절</T>
                </DropdownMenuItem>
              </>
            )}
            {safe.map((a) => (
              <DropdownMenuItem key={a} onClick={() => act(p, a)}>
                {(() => { const I = ICON[a]; return <I className="w-4 h-4" /> })()} <T>{MANAGE_ACTION_LABEL[a]}</T>
              </DropdownMenuItem>
            ))}
            {risky.length > 0 && <DropdownMenuSeparator />}
            {risky.map((a) => (
              <DropdownMenuItem key={a} variant="destructive" onClick={() => act(p, a)}>
                {(() => { const I = ICON[a]; return <I className="w-4 h-4" /> })()} <T>{MANAGE_ACTION_LABEL[a]}</T>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    )
  }

  return (
    <section className="card overflow-hidden sm-card">
      <div className="sm-tabs" role="tablist" aria-label={t('관계 목록')}>
        {MANAGE_TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === tab} className={`sm-tab ${x.id === tab ? 'on' : ''}`} onClick={() => pick(x.id)}>
            <T>{x.label}</T>
            <span className="sm-count">{counts[x.id]}</span>
            {x.id === 'requests' && incoming > 0 && <span className="sm-dot" aria-label={t('새 요청')} />}
          </button>
        ))}
      </div>
      <div className="sm-search">
        <Search className="w-4 h-4 text-n-888" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('이름으로 찾기')} aria-label={t('이름으로 찾기')} maxLength={40} enterKeyHint="search" />
      </div>
      {tab === 'followers' && (
        <p className="sm-hint">
          <T>‘팔로워 공개’ 글은 친구에게도 보여요.</T>
        </p>
      )}
      {tab === 'friends' && (
        <p className="sm-hint">
          <T>친구는 서로 수락한 관계예요. 서로 팔로우하는 ‘맞팔’과는 따로예요.</T>
        </p>
      )}
      {shown.length === 0 ? (
        <p className="sm-empty">{q.trim() ? <T>찾는 사람이 없어요.</T> : <T>{EMPTY[tab]}</T>}</p>
      ) : tab === 'requests' ? (
        <>
          {received.length > 0 && (
            <>
              <h2 className="sm-group">
                <T>받은 요청</T> <span className="sm-count">{received.length}</span>
              </h2>
              <ul>{received.map(row)}</ul>
            </>
          )}
          {rest.length > 0 && (
            <>
              <h2 className="sm-group">
                <T>보낸 요청</T> <span className="sm-count">{rest.length}</span>
              </h2>
              <ul>{rest.map(row)}</ul>
            </>
          )}
        </>
      ) : (
        <ul>{rest.map(row)}</ul>
      )}
    </section>
  )
}
