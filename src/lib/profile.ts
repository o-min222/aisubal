import type { Member, Post, PostAs, PublicAuthor, SiteSettings } from '@/lib/supabase/types'

export const DEFAULT_NICKNAME_UNLOCK_THRESHOLD = 100
export const DEV_NICKNAME_UNLOCK_THRESHOLD = 3 // low so both modes are reviewable in seed

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 24
export const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣_]{2,24}$/

/** Opaque public id for a nickname profile — must NOT equal member.id */
export function nicknameProfilePublicId(memberId: string): string {
  // Deterministic opaque id so seed/dev stays stable without leaking member uuid as-is
  return `nick_${memberId.replace(/-/g, '').slice(0, 16)}`
}

export function memberHasNicknameProfile(member: Member): boolean {
  return Boolean(member.nickname && member.nickname_created_at)
}

export function isNicknameUnlocked(
  activeMemberCount: number,
  threshold: number = DEFAULT_NICKNAME_UNLOCK_THRESHOLD
): boolean {
  return activeMemberCount >= threshold
}

export function validateNickname(
  raw: string
): { ok: true; nickname: string } | { ok: false; reason: string } {
  const nickname = raw.trim()
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return { ok: false, reason: `별명은 ${NICKNAME_MIN}~${NICKNAME_MAX}자여야 합니다.` }
  }
  if (!NICKNAME_REGEX.test(nickname)) {
    return { ok: false, reason: '별명은 한글, 영문, 숫자, _ 만 사용할 수 있습니다.' }
  }
  const reserved = ['admin', '관리자', 'aisubal', 'system', 'null', 'undefined']
  if (reserved.includes(nickname.toLowerCase())) {
    return { ok: false, reason: '사용할 수 없는 별명입니다.' }
  }
  return { ok: true, nickname }
}

export function canPostAs(
  member: Member,
  postedAs: PostAs,
  unlocked: boolean
): { ok: true } | { ok: false; reason: string } {
  if (postedAs === 'real') return { ok: true }
  if (!unlocked) {
    return { ok: false, reason: '아직 별명 프로필이 오픈되지 않았습니다.' }
  }
  if (!memberHasNicknameProfile(member)) {
    return { ok: false, reason: '먼저 설정에서 별명 프로필을 만들어 주세요.' }
  }
  return { ok: true }
}

/** Build the public author object for a post — never links nickname ↔ real identity */
export function toPublicAuthor(member: Member, postedAs: PostAs): PublicAuthor {
  if (postedAs === 'nickname' && member.nickname) {
    return {
      kind: 'nickname',
      id: nicknameProfilePublicId(member.id),
      nickname: member.nickname,
      bio: member.nickname_bio,
      avatar_url: member.nickname_avatar_url,
    }
  }
  return {
    kind: 'real',
    id: member.id,
    display_name: member.display_name,
    bio: member.bio,
    avatar_url: member.avatar_url,
  }
}

export function publicAuthorLabel(author: PublicAuthor): string {
  return author.kind === 'nickname' ? author.nickname : author.display_name
}

/** Keys that must never appear on public post/author payloads */
export const FORBIDDEN_PUBLIC_KEYS = [
  'email',
  'google_name',
  'googleName',
  'auth_id',
  'authId',
  'password',
  'passwordHash',
  'author_id',
  'authorId',
  'member_id',
  'memberId',
] as const

export function collectForbiddenKeys(value: unknown, path = ''): string[] {
  const found: string[] = []
  if (value === null || value === undefined) return found
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...collectForbiddenKeys(v, `${path}[${i}]`)))
    return found
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      if ((FORBIDDEN_PUBLIC_KEYS as readonly string[]).includes(k)) {
        found.push(p)
      }
      found.push(...collectForbiddenKeys(v, p))
    }
  }
  return found
}

export function assertNoIdentityLeak(payload: unknown, secrets: string[] = []) {
  const keys = collectForbiddenKeys(payload)
  if (keys.length > 0) {
    throw new Error(`Identity leak via keys: ${keys.join(', ')}`)
  }
  const text = JSON.stringify(payload)
  for (const secret of secrets) {
    if (secret && secret.length >= 3 && text.includes(secret)) {
      throw new Error(`Identity leak of secret value: ${secret}`)
    }
  }
}

export function defaultSiteSettings(dev = false): SiteSettings {
  return {
    nickname_unlock_threshold: dev
      ? DEV_NICKNAME_UNLOCK_THRESHOLD
      : DEFAULT_NICKNAME_UNLOCK_THRESHOLD,
    site_name: 'AI쓰발',
    invites_per_member: 2,
  }
}

export type PostPublicView = {
  id: string
  title: string
  content: string
  source_note: string | null
  url: string | null
  link_title: string | null
  link_description: string | null
  link_image: string | null
  link_site_name: string | null
  link_favicon: string | null
  link_type: string | null
  posted_as: PostAs
  author: PublicAuthor
  is_agent_posted: boolean
  created_at: string
  archive_count?: number
}

export function toPublicPost(
  post: Post,
  member: Member,
  extras?: { archive_count?: number }
): PostPublicView {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    source_note: post.source_note,
    url: post.url,
    link_title: post.link_title,
    link_description: post.link_description,
    link_image: post.link_image,
    link_site_name: post.link_site_name,
    link_favicon: post.link_favicon,
    link_type: post.link_type,
    posted_as: post.posted_as,
    author: toPublicAuthor(member, post.posted_as),
    is_agent_posted: post.is_agent_posted,
    created_at: post.created_at,
    archive_count: extras?.archive_count,
  }
}
