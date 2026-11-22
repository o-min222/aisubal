import { getT } from '@/i18n/server'
export async function TimelineSkeleton({ count = 4 }: { count?: number }) {
  const st = await getT()
  return (
    <div className="timeline-list" aria-busy="true" aria-label={st('불러오는 중')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="timeline-card">
          <div className="flex gap-3">
            <span className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <span className="skeleton block h-3 w-28 rounded" />
              <span className="skeleton block h-3 w-full rounded" />
              <span className="skeleton block h-3 w-4/5 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export async function PageSkeleton() {
  const st = await getT()
  return (
    <div className="space-y-3" aria-busy="true" aria-label={st('불러오는 중')}>
      <span className="skeleton block h-7 w-40 rounded" />
      <span className="skeleton block h-24 w-full rounded-xl" />
      <span className="skeleton block h-24 w-full rounded-xl" />
      <span className="skeleton block h-24 w-full rounded-xl" />
    </div>
  )
}
