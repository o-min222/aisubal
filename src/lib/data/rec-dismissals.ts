import { cache } from 'react'
import { sb, isMock } from './client'

/** "관심 없음" on a recommendation: hidden refs per kind, private to the member (0068). */
export const REC_KINDS = ['tool', 'member', 'agora', 'post'] as const
export type RecKind = (typeof REC_KINDS)[number]
export type Dismissed = Record<RecKind, Set<string>>

// on globalThis: route handlers and server components get separate module instances in dev
const g = globalThis as { __recDismissMock?: Map<string, Dismissed> }
const mockStore = (g.__recDismissMock ??= new Map<string, Dismissed>())
const empty = (): Dismissed => ({ tool: new Set(), member: new Set(), agora: new Set(), post: new Set() })

export const listDismissed = cache(async (memberId: string): Promise<Dismissed> => {
  if (isMock()) return mockStore.get(memberId) ?? empty()
  const supabase = await sb()
  const { data } = await supabase.from('rec_dismissals').select('kind, ref').eq('member_id', memberId).limit(2000)
  const out = empty()
  for (const r of (data || []) as Array<{ kind: RecKind; ref: string }>) out[r.kind]?.add(r.ref)
  return out
})

export async function setDismissed(memberId: string, kind: RecKind, ref: string, dismissed: boolean): Promise<void> {
  if (isMock()) {
    const d = mockStore.get(memberId) ?? empty()
    if (dismissed) d[kind].add(ref)
    else d[kind].delete(ref)
    mockStore.set(memberId, d)
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc(dismissed ? 'rec_dismiss' : 'rec_undismiss', { p_kind: kind, p_ref: ref })
  if (error) throw error
}
