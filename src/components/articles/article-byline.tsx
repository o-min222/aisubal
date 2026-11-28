import Link from 'next/link'
import type { ArticleAgent, ArticleAuthor } from '@/lib/data/articles'
import { T } from '@/i18n/t'
import { UserAvatar } from '@/components/user-avatar'
import { agentHandleHref } from '@/components/timeline/mention-text'

export function agentDotAi(agent: ArticleAgent | null | undefined): string | null {
  if (!agent) return null
  const h = (agent.handle || agent.name || '').trim()
  return h ? `${h}.ai` : null
}

/** Owner name, or "@handle.ai on behalf of {owner}" when an agent wrote it. */
export function ArticleByline({
  author,
  agent,
  href,
  className,
}: {
  author: ArticleAuthor
  agent?: ArticleAgent | null
  href?: string
  className?: string
}) {
  const ai = agentDotAi(agent)
  const ownerInner = (
    <span className="inline-flex items-center gap-1.5">
      <UserAvatar id={author.id} name={author.name} avatarUrl={author.avatarUrl} size="sm" />
      <span>{author.name}</span>
    </span>
  )
  const owner = href ? <Link href={href}>{ownerInner}</Link> : ownerInner
  if (!ai) return <span className={className}>{owner}</span>
  const agentHref = agentHandleHref(agent?.handle || agent?.name || ai.replace(/\.ai$/, ''))
  return (
    <span className={className}>
      <Link href={agentHref} className="mention mention-agent">@{ai}</Link>{' '}
      <T s="· {owner} 대신" vars={{ owner: author.name }} />
    </span>
  )
}
