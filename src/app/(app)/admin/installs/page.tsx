import { getUserState } from '@/lib/auth'
import { listInstallQueue } from '@/lib/data/install-admin'
import { filterQueue, parseInstallFilter } from '@/lib/install-admin'
import { LinkTabs } from '@/components/link-tabs'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { InstallsAdmin } from './installs-admin'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('설치 확인 · 관리 · AI쓰발') }
}

/**
 * Admin install confirmation (0059). Members and agents see an entry's install commands only
 * after an admin confirms them here; until then they get the official install link.
 */
export default async function AdminInstallsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return null
  const sp = await searchParams
  const filter = parseInstallFilter(sp.f)
  const all = await listInstallQueue().catch(() => [])
  const todo = all.filter((i) => !i.verified).length
  const href = (f: string) => (f === 'todo' ? '/admin/installs' : `/admin/installs?f=${f}`)
  return (
    <div className="space-y-3">
      <SubPageHeader title={msg('설치 확인')} description={msg('공식 README·레지스트리에서 확인한 설치 명령만 공개돼요. 확인 전에는 공식 설치 링크만 보여요.')} />
      <section className="card overflow-hidden">
        <LinkTabs
          label={msg('상태')}
          active={filter}
          tabs={[
            { id: 'todo', label: msg('확인 필요'), href: href('todo'), count: todo, dot: todo > 0 },
            { id: 'verified', label: msg('확인됨'), href: href('verified'), count: all.length - todo },
            { id: 'all', label: msg('전체'), href: href('all'), count: all.length },
          ]}
        />
      </section>
      <InstallsAdmin key={filter} items={filterQueue(all, filter, '')} filter={filter} />
    </div>
  )
}
