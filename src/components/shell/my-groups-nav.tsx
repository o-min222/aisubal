'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { useT } from '@/i18n/client'
import { GroupAvatar } from '@/components/groups/group-avatar'

export type MyGroupLink = { slug: string; name: string; emoji: string | null; role: string | null }

/** Side panel '내 그룹' (content-only: just links into each group's timeline). */
export function MyGroupsNav({ groups }: { groups: MyGroupLink[] }) {
  const pathname = usePathname()
  const t = useT()
  return (
    <section className="my-groups-nav" aria-label={t('내 그룹')} style={{ marginTop: 14 }}>
      <div className="flex items-center justify-between px-3 mb-1">
        <h3 className="text-[12px] font-semibold" style={{ color: 'var(--n-777)' }}>
          {t('내 그룹')}
        </h3>
        <Link href="/groups/new" className="text-n-888 hover:text-n-111 p-1 rounded" aria-label={t('그룹 만들기')} title={t('그룹 만들기')}>
          <Plus className="w-3.5 h-3.5" />
        </Link>
      </div>
      {groups.length === 0 ? (
        <Link href="/groups" className="side-nav-item text-[13px]" style={{ color: 'var(--n-666)' }}>
          {t('그룹 둘러보기')}
        </Link>
      ) : (
        <ul>
          {groups.slice(0, 8).map((g) => {
            const href = `/groups/${g.slug}`
            const on = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={g.slug}>
                <Link href={href} className={`side-nav-item text-[13.5px] ${on ? 'active' : ''}`} aria-current={on ? 'page' : undefined}>
                  <GroupAvatar name={g.name} size={20} />
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            )
          })}
          {groups.length > 8 && (
            <li>
              <Link href="/groups" className="side-nav-item text-[13px]" style={{ color: 'var(--n-666)' }}>
                {t('모두 보기 ({n})', { n: groups.length })}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
