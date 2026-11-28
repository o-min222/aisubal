/** A56: pure rules for the blur teaser (/t/<slug>). Mirrors teaser__eligible / teaser_public (0106). */
const TEASER_LINES = 3
const TEASER_CHARS = 160

/** first 3 non-empty lines, at most 160 characters; the rest never reaches the page */
export function teaserExcerpt(body: string): { excerpt: string; more: boolean } {
  const all = body.trim()
  let ex = all.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, TEASER_LINES).join('\n')
  if ([...ex].length > TEASER_CHARS) ex = [...ex].slice(0, TEASER_CHARS - 1).join('') + '…'
  return { excerpt: ex, more: [...all].length > [...ex].length || ex.endsWith('…') }
}

type TeaserCandidate = {
  isMine?: boolean
  parentId?: string | null
  groupId?: string | null
  isNickname?: boolean
  visibility?: string
  isDeleted?: boolean
  author: { kind: string }
}

/** client-side gate for the menu row; the RPC decides for real */
export function canOfferTeaser(p: TeaserCandidate): boolean {
  return Boolean(p.isMine) && !p.parentId && !p.groupId && !p.isNickname && !p.isDeleted && p.author.kind === 'member' && (p.visibility ?? 'members') === 'members'
}

export function teaserPath(slug: string): string {
  return `/t/${slug}`
}

export const TEASER_SLUG = /^[0-9a-f]{12}$/
