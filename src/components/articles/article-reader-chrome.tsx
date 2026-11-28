import Link from 'next/link'
import Image from 'next/image'
import type { Member } from '@/lib/supabase/types'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { UserAvatar } from '@/components/user-avatar'
import { ArticleBackLink } from './article-back-link'

/** Slim typography-first chrome for the reading view (members and signed-out visitors). */
export async function ArticleReaderChrome({
  children,
  member,
  nextPath,
}: {
  children: React.ReactNode
  member: Member | null
  nextPath: string
}) {
  const t = await getT()
  return (
    <div className="article-shell">
      <header className="article-shell-bar">
        <div className="article-shell-lead">
          {member && <ArticleBackLink />}
          <Link href={member ? '/articles' : '/'} className="article-shell-logo" aria-label={t('AI쓰발')}>
            <Image src="/images/logo-black.png" alt={t('AI쓰발')} width={88} height={26} className="logo-ink" />
          </Link>
        </div>
        <div className="article-shell-actions">
          {!member && (
            <Link href={`/?next=${encodeURIComponent(nextPath)}`} className="btn btn-primary btn-sm"><T>로그인</T></Link>
          )}
          {member && (
            <Link href={`/members/${member.id}`} aria-label={member.display_name}>
              <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} size="sm" />
            </Link>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}
