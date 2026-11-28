import type { Member, Post, PostAs, PublicAuthor } from '@/lib/supabase/types'
import { msg } from '@/i18n/translate'

export const DEFAULT_ANON_UNLOCK_THRESHOLD = 100
export const DEV_ANON_UNLOCK_THRESHOLD = 3
/**
 * Public id for a 부캐: derived ONLY from its own nickname_profiles.id (0052), never from the
 * member id (the old member-uuid prefix was linkable back to the member).
 */
export function nicknameProfilePublicId(nicknameId: string): string {
  return `nick_${nicknameId}`
}


export function isAnonUnlocked(
  activeMemberCount: number,
  threshold: number = DEFAULT_ANON_UNLOCK_THRESHOLD
): boolean {
  return activeMemberCount >= threshold
}


/** A42: 부캐 (nickname) posting is retired; old nickname rows still render as before */
export function canPostAs(postedAs: PostAs): { ok: true } | { ok: false; reason: string } {
  if (postedAs === 'real') return { ok: true }
  return { ok: false, reason: msg('부캐 프로필은 더 이상 쓸 수 없어요.') }
}

/** Build the public author object for a post — never links nickname ↔ real identity */
export function toPublicAuthor(member: Member, postedAs: PostAs): PublicAuthor {
  // 부캐 rows never fall back to the real name — without a nickname profile they stay anonymous.
  if (postedAs === 'nickname') {
    return {
      kind: 'nickname',
      id: member.nickname_id ? nicknameProfilePublicId(member.nickname_id) : 'nick_unknown',
      nickname: member.nickname || '별명',
      bio: member.nickname ? member.nickname_bio : null,
      avatar_url: member.nickname ? member.nickname_avatar_url : null,
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
const FORBIDDEN_PUBLIC_KEYS = [
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


type PostPublicView = {
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

/**
 * Public view from an already-hydrated post (its author is the 부캐 on nickname rows — never the member).
 * Use this when the member behind the row isn't (and mustn't be) known, e.g. 부캐 posts since 0052.
 */
export function toPublicPostView(
  post: Post & { author: PublicAuthor },
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
    author: post.author,
    is_agent_posted: post.is_agent_posted,
    created_at: post.created_at,
    archive_count: extras?.archive_count,
  }
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
