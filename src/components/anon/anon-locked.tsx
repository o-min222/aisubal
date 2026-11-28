import { VenetianMask } from 'lucide-react'
import { T } from '@/i18n/t'

/** A42: the board stays closed until the community reaches the admin-set member count. */
export function AnonLocked({ threshold, activeCount }: { threshold: number; activeCount: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((activeCount / Math.max(1, threshold)) * 100)))
  return (
    <div className="card anon-locked" role="status">
      <VenetianMask className="w-6 h-6 text-n-888" aria-hidden="true" />
      <h1 className="anon-locked-title"><T>익명 라운지</T></h1>
      <p className="text-sm text-n-666">
        <T s="멤버 {threshold}명부터 열려요 · 현재 {count}명" vars={{ threshold: threshold.toLocaleString('en-US'), count: activeCount.toLocaleString('en-US') }} />
      </p>
      <div className="anon-locked-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-n-888"><T>멤버가 모이면 누가 썼는지 보이지 않는 익명 글을 쓸 수 있어요.</T></p>
    </div>
  )
}
