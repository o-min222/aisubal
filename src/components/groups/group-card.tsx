import { EyeOff, Lock, Users } from 'lucide-react'
import type { Group } from '@/lib/data/groups'
import { T } from '@/i18n/t'

export function GroupPolicy({ g }: { g: Pick<Group, 'joinPolicy' | 'isHidden'> }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: 'var(--n-777)' }}>
      <span className="inline-flex items-center gap-1">
        {g.joinPolicy === 'approval' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
        {g.joinPolicy === 'approval' ? <T>승인 후 가입</T> : <T>누구나 가입</T>}
      </span>
      {g.isHidden && (
        <span className="inline-flex items-center gap-1">
          <EyeOff className="w-3 h-3" /> <T>숨김</T>
        </span>
      )}
    </span>
  )
}

