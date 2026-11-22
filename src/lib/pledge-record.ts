import { PLEDGE_KO, PLEDGE_VERSION, kstYear, withYear } from '@/lib/pledge'

/**
 * Permanent pledge record ('입단 기록'). The digest is a real SHA-256 over a
 * canonical payload that the database builds identically (pledge__digest in
 * migration 0020), so anyone holding the record can recompute it.
 *
 *   aisubal-pledge/1
 *   kind:member|agent
 *   version:1
 *   text:<canonical Korean pledge, lines joined by \n; dateline year = KST year of signed_at>
 *   signer:<self-made nickname | '{owner}님의 {agent}'>
 *   inviter:<inviter nickname | owner nickname for agents | ''>
 *   prev:<inviter's (or owner's) record digest | genesis>
 *   signed_at:<UTC ISO-8601 with milliseconds, e.g. 2026-11-22T10:24:00.123Z>
 */
export type PledgeKind = 'member' | 'agent'

export type PledgeRecord = {
  kind: PledgeKind
  no: number
  hash: string
  prevHash: string | null
  signedAt: string
  signer: string
  inviter: string | null
  /** the linked previous block: inviter's (member) or owner's (agent) record */
  prevNo: number | null
}

/** The authored Korean pledge is the canonical text in every locale, dated in the signing year (KST). */
export function pledgeCanonicalText(signedAt: string): string {
  const t = withYear(PLEDGE_KO, kstYear(signedAt))
  return [t.title, ...t.preamble, ...t.vows, t.closing, t.dateline].join('\n')
}

export function pledgePayload(p: { kind: PledgeKind; version?: number; signer: string; inviter: string | null; prevHash: string | null; signedAt: string }): string {
  return [
    'aisubal-pledge/1',
    `kind:${p.kind}`,
    `version:${p.version ?? PLEDGE_VERSION}`,
    `text:${pledgeCanonicalText(p.signedAt)}`,
    `signer:${p.signer}`,
    `inviter:${p.inviter ?? ''}`,
    `prev:${p.prevHash ?? 'genesis'}`,
    `signed_at:${new Date(p.signedAt).toISOString()}`,
  ].join('\n')
}

/** SHA-256 hex via WebCrypto (browser and Node 20+). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const pledgeDigest = (p: Parameters<typeof pledgePayload>[0]) => sha256Hex(pledgePayload(p))

/** '#0001' */
export const recordNo = (n: number | null | undefined) => (n ? `#${String(n).padStart(4, '0')}` : '')
/** '3fa2b9c1…e07d' */
export const shortHash = (h: string | null | undefined, head = 8, tail = 4) => (h ? `${h.slice(0, head)}…${h.slice(-tail)}` : '')
