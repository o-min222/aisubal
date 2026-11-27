import Link from 'next/link'
import { LogoWordmark } from '@/components/logo'
import type { Member } from '@/lib/supabase/types'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { UserAvatar } from '@/components/user-avatar'

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
        <Link href={member ? '/articles' : '/'} className="article-shell-logo" aria-label={t('AI쓰발')}>
          <LogoWordmark className="logo-ink" title={t('AI쓰발')} />
        </Link>
        <div className="article-shell-actions">
          {member ? (
            <Link href="/articles" className="btn btn-secondary btn-sm"><T>아티클</T></Link>
          ) : (
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
