import { cache } from 'react'
import { cookies } from 'next/headers'
import type { Member } from '@/lib/supabase/types'
import { PLEDGE_VERSION, signatureMatches, type PledgeStatus } from '@/lib/pledge'
import { pledgeDigest } from '@/lib/pledge-record'
import { sb, useMockData as isMock } from './client'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const g = globalThis as unknown as { __aisubalPledge?: Map<string, string> }
const mockSigned = (): Map<string, string> => (g.__aisubalPledge ??= new Map())
const MOCK_DEFAULT_SIGNED = '2026-11-01T12:00:00.000Z'

/** Mock record: the inviter '에이전트덕후' is block #0001, the dev member #0002. */
async function mockStatus(member: Member, signedAt: string | null): Promise<PledgeStatus> {
  const inviter = '에이전트덕후'
  if (!signedAt) return { signedAt: null, version: null, signer: member.display_name, inviter, no: null, hash: null, prevHash: null, prevNo: null }
  const prevHash = await pledgeDigest({ kind: 'member', signer: inviter, inviter: null, prevHash: null, signedAt: '2026-10-01T03:00:00.000Z' })
  const hash = await pledgeDigest({ kind: 'member', signer: member.display_name, inviter, prevHash, signedAt })
  return { signedAt, version: PLEDGE_VERSION, signer: member.display_name, inviter, no: 2, hash, prevHash, prevNo: 1 }
}

const num = (v: unknown) => (v == null ? null : Number(v))
const str = (v: unknown) => (v == null ? null : String(v))

function fromRpc(d: Record<string, unknown>, member: Member): PledgeStatus {
  return {
    signedAt: str(d.signedAt),
    version: num(d.version),
    signer: String(d.signer ?? member.display_name),
    inviter: str(d.inviter),
    no: num(d.no),
    hash: str(d.hash),
    prevHash: str(d.prevHash),
    prevNo: num(d.prevNo),
  }
}

/** Own pledge state + record (cached per request). Mock: signed unless the dev_pledge=unsigned cookie is set. */
export const getPledgeStatus = cache(async (member: Member): Promise<PledgeStatus> => {
  if (isMock()) {
    const forceUnsigned = (await cookies()).get('dev_pledge')?.value === 'unsigned'
    return mockStatus(member, forceUnsigned ? null : (mockSigned().get(member.id) ?? MOCK_DEFAULT_SIGNED))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('pledge_status')
  if (error || !data) throw new Error(error?.message || 'pledge_status failed')
  return fromRpc(data as Record<string, unknown>, member)
})

export type SignResult = ({ ok: true } & PledgeStatus) | { ok: false; error: string }

export async function signPledge(member: Member, signature: string): Promise<SignResult> {
  if (!signatureMatches(signature, member.display_name)) return { ok: false, error: await te('서명란에 내 닉네임 ‘{name}’을 그대로 적어 주세요.', { name: member.display_name }) }
  if (isMock()) {
    const at = mockSigned().get(member.id) ?? new Date().toISOString()
    mockSigned().set(member.id, at)
    return { ok: true, ...(await mockStatus(member, at)) }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('pledge_sign', { p_version: PLEDGE_VERSION, p_signature: signature })
  if (error) {
    const m = error.message || ''
    if (m.includes('signature_mismatch')) return { ok: false, error: await te('서명란에 내 닉네임 ‘{name}’을 그대로 적어 주세요.', { name: member.display_name }) }
    if (m.includes('profile_required')) return { ok: false, error: msg('먼저 프로필을 만들어 주세요.') }
    return { ok: false, error: msg('서약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.') }
  }
  return { ok: true, ...fromRpc(data as Record<string, unknown>, member) }
}
