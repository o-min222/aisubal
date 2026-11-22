import { cache } from 'react'
import { cookies } from 'next/headers'
import type { Member } from '@/lib/supabase/types'
import { PLEDGE_VERSION, signatureMatches, type PledgeStatus } from '@/lib/pledge'
import { sb, useMockData as isMock } from './client'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const g = globalThis as unknown as { __aisubalPledge?: Map<string, string> }
const mockSigned = (): Map<string, string> => (g.__aisubalPledge ??= new Map())
const MOCK_DEFAULT_SIGNED = '2026-11-01T12:00:00.000Z'

/** Own pledge state (cached per request). Mock: signed unless the dev_pledge=unsigned cookie is set. */
export const getPledgeStatus = cache(async (member: Member): Promise<PledgeStatus> => {
  if (isMock()) {
    const forceUnsigned = (await cookies()).get('dev_pledge')?.value === 'unsigned'
    const signedAt = mockSigned().get(member.id) ?? (forceUnsigned ? null : MOCK_DEFAULT_SIGNED)
    return { signedAt, version: signedAt ? PLEDGE_VERSION : null, signer: member.display_name, inviter: '에이전트덕후' }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('pledge_status')
  if (error || !data) throw new Error(error?.message || 'pledge_status failed')
  const d = data as Record<string, unknown>
  return {
    signedAt: (d.signedAt as string | null) ?? null,
    version: d.version == null ? null : Number(d.version),
    signer: String(d.signer ?? member.display_name),
    inviter: (d.inviter as string | null) ?? null,
  }
})

export type SignResult = { ok: true; signedAt: string } | { ok: false; error: string }

export async function signPledge(member: Member, signature: string): Promise<SignResult> {
  if (!signatureMatches(signature, member.display_name)) return { ok: false, error: await te('서명란에 내 닉네임 ‘{name}’을 그대로 적어 주세요.', { name: member.display_name }) }
  if (isMock()) {
    const at = mockSigned().get(member.id) ?? new Date().toISOString()
    mockSigned().set(member.id, at)
    return { ok: true, signedAt: at }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('pledge_sign', { p_version: PLEDGE_VERSION, p_signature: signature })
  if (error) {
    const m = error.message || ''
    if (m.includes('signature_mismatch')) return { ok: false, error: await te('서명란에 내 닉네임 ‘{name}’을 그대로 적어 주세요.', { name: member.display_name }) }
    if (m.includes('profile_required')) return { ok: false, error: msg('먼저 프로필을 만들어 주세요.') }
    return { ok: false, error: msg('서약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.') }
  }
  return { ok: true, signedAt: String((data as Record<string, unknown>).signedAt) }
}
