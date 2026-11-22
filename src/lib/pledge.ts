/** '선언 및 입단 서약' — authored text, keep verbatim. Bump PLEDGE_VERSION if the text changes. */
export const PLEDGE_VERSION = 1

export const PLEDGE_KO = {
  title: '[AI쓰발 선언 및 입단 서약]',
  preamble: [
    '인류사의 흐름 속에서 낡은 시대의 굴레를 끊고 새로운 지성의 시대로 나아가야 할 때가 온다면, 우리는 그 결단의 이유를 분명히 밝혀야 한다.',
    '우리는 다음의 진리가 자명하다고 믿는다. 인류는 언제나 허락된 선을 넘음으로써 진화해 왔으며, AI를 쓰고 발전하는 모든 이에게는 낡은 상식과 규범 너머를 탐구할 권리가 있다.',
    '이에 초대로 맺어진 신뢰의 연대 AI쓰발에 합류하며, 다음을 서약한다.',
  ],
  vows: [
    '첫째, 어제의 상식과 기술의 속도를 따라오지 못하는 낡은 규범에 갇히지 않고, 가장 과감한 실험을 멈추지 않겠다.',
    '둘째, 내가 발견한 돌파구를 독점하지 않고, 동료들과 나누고 변주하며 함께 진화하겠다.',
    '셋째, 초대로 맺어진 이 공간의 신뢰를 굳건히 지키며, 선을 넘는 자유에 따르는 모든 책임을 스스로 지겠다.',
  ],
  closing: '이 선언을 뒷받침하기 위해, 우리는 서로의 신뢰와 명예를 걸고 굳게 서약한다.',
  dateline: '2026년, 새로운 시대의 경계 위에서',
  signerLabel: '서약자',
  inviterLabel: '초대인',
} as const

export type PledgeText = { [K in keyof typeof PLEDGE_KO]: (typeof PLEDGE_KO)[K] extends readonly string[] ? readonly string[] : string }

export type PledgeStatus = { signedAt: string | null; version: number | null; signer: string; inviter: string | null }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
/** The typed signature must be the member's own self-made name (same rule as pledge_sign in SQL). */
export const signatureMatches = (typed: string, name: string) => squash(typed) !== '' && squash(typed) === squash(name)

/** Plain-text rendering (copy / tests): exactly the authored text with the footer filled in. */
export function pledgePlainText(t: PledgeText, signer: string, inviter: string | null, founding = '창립 멤버'): string {
  return [
    t.title,
    ...t.preamble,
    ...t.vows.map((v) => `- ${v}`),
    t.closing,
    t.dateline,
    `${t.signerLabel}: ${signer} / ${t.inviterLabel}: ${inviter ?? founding}`,
  ].join('\n\n')
}

export const SLOGAN = {
  en: 'From the Shadows, Toward the Light.',
  ko: '가장 어두운 가능성까지 외면하지 않고 포용하며, AI와 함께 진리와 인류의 다음 장을 엽니다.',
} as const
