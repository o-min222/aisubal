import { msg } from '@/i18n/translate'
/**
 * Privacy-first profile rules (0010). The self-made profile — display name,
 * unique @handle, avatar, bio — is the identity everywhere. Google name, email
 * and photo are private prefill only; the real name is opt-in.
 * The database (profile_save / links_save) re-validates everything.
 */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/
export const RESERVED_HANDLES = new Set([
  'admin', 'root', 'system', 'aisubal', 'support', 'help', 'null', 'undefined', 'me', 'settings', 'moim', 'groups',
  'network', 'agora', 'anon', 'feed', 'tools', 'api', 'mod', 'staff', 'official',
])

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

export function validateHandle(raw: string): { ok: true; handle: string } | { ok: false; reason: string } {
  const handle = normalizeHandle(raw)
  if (!HANDLE_RE.test(handle)) return { ok: false, reason: '핸들은 영문 소문자·숫자·_ 3~20자예요.' }
  if (RESERVED_HANDLES.has(handle)) return { ok: false, reason: '사용할 수 없는 핸들이에요.' }
  return { ok: true, handle }
}

export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 24) return { ok: false, reason: '이름은 2~24자예요.' }
  // eslint-disable-next-line no-control-regex
  if (/[@<>\u0000-\u001f]/.test(name)) return { ok: false, reason: '@, <, > 는 이름에 쓸 수 없어요.' }
  return { ok: true, name }
}

/** Suggest a handle from a self-chosen name (never from the Google name). */
export function suggestHandle(name: string): string {
  const ascii = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20)
  return HANDLE_RE.test(ascii) && !RESERVED_HANDLES.has(ascii) ? ascii : ''
}

export type LinkKind =
  | 'x' | 'instagram' | 'threads' | 'linkedin' | 'github' | 'youtube' | 'tiktok' | 'facebook' | 'bluesky' | 'huggingface' | 'blog' | 'website'
export type LinkVisibility = 'members' | 'friends' | 'private'
export type ProfileLink = { kind: LinkKind; url: string; visibility: LinkVisibility }

export const LINK_KINDS: Array<{ kind: LinkKind; label: string; placeholder: string; host: RegExp | null }> = [
  { kind: 'x', label: 'X', placeholder: 'https://x.com/handle', host: /^https:\/\/(www\.)?(x|twitter)\.com\//i },
  { kind: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/handle', host: /^https:\/\/(www\.)?instagram\.com\//i },
  { kind: 'threads', label: 'Threads', placeholder: 'https://threads.net/@handle', host: /^https:\/\/(www\.)?threads\.(net|com)\//i },
  { kind: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/handle', host: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i },
  { kind: 'github', label: 'GitHub', placeholder: 'https://github.com/handle', host: /^https:\/\/(www\.)?github\.com\//i },
  { kind: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@handle', host: /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//i },
  { kind: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@handle', host: /^https:\/\/(www\.)?tiktok\.com\//i },
  { kind: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/handle', host: /^https:\/\/((www|m)\.)?facebook\.com\//i },
  { kind: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/handle', host: /^https:\/\/(www\.)?bsky\.app\//i },
  { kind: 'huggingface', label: 'Hugging Face', placeholder: 'https://huggingface.co/handle', host: /^https:\/\/(www\.)?huggingface\.co\//i },
  { kind: 'blog', label: msg('블로그'), placeholder: 'https://blog.example.com', host: null },
  { kind: 'website', label: msg('웹사이트'), placeholder: 'https://example.com', host: null },
]
export const LINK_KIND_SET = new Set(LINK_KINDS.map((k) => k.kind))
export const MAX_LINKS = 12

export const LINK_VISIBILITY: Array<{ id: LinkVisibility; label: string; hint: string }> = [
  { id: 'members', label: msg('전체 회원'), hint: msg('로그인한 AI쓰발 멤버 모두') },
  { id: 'friends', label: msg('친구만'), hint: msg('친구 수락한 사람만') },
  { id: 'private', label: msg('비공개'), hint: msg('나만 보기') },
]

export function validateLink(kind: string, rawUrl: string): { ok: true; url: string } | { ok: false; reason: string } {
  const def = LINK_KINDS.find((k) => k.kind === kind)
  if (!def) return { ok: false, reason: '지원하지 않는 링크 종류예요.' }
  let url = rawUrl.trim()
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
  url = url.replace(/^http:\/\//i, 'https://')
  if (url.length > 300) return { ok: false, reason: '링크가 너무 길어요.' }
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) throw new Error()
  } catch {
    return { ok: false, reason: `${def.label} 링크 형식이 올바르지 않아요.` }
  }
  if (!/^https:\/\/[^\s/@]+\.[^\s/@]+(\/[^\s]*)?$/.test(url)) return { ok: false, reason: `${def.label} 링크 형식이 올바르지 않아요.` }
  if (def.host && !def.host.test(url)) return { ok: false, reason: `${def.label} 주소(${def.placeholder.replace(/handle.*$/, '…')})를 입력해주세요.` }
  return { ok: true, url }
}

export const PROFILE_ERRORS: Record<string, string> = {
  profile_handle_invalid: '핸들은 영문 소문자·숫자·_ 3~20자예요.',
  profile_handle_taken: '이미 쓰는 핸들이에요. 다른 핸들을 골라주세요.',
  profile_name_invalid: '이름은 2~24자, @ < > 없이 입력해주세요.',
  profile_bio_too_long: '소개는 160자까지예요.',
  profile_avatar_invalid: '아바타 이미지를 다시 올려주세요.',
  profile_nickname_taken: '이미 쓰는 별명이에요.',
  links_invalid: '링크는 12개까지 저장할 수 있어요.',
  links_invalid_url: '링크 주소를 확인해주세요.',
}
export function profileErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const key = Object.keys(PROFILE_ERRORS).find((k) => msg.includes(k))
  return key ? PROFILE_ERRORS[key] : '저장하지 못했어요.'
}
