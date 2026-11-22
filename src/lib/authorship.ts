import { msg } from '@/i18n/translate'

/** Author-declared: how a member post was made (0046 posts.authorship). Agent rows are AI by author_kind. */
export const AUTHORSHIPS = ['human', 'ai_assisted', 'ai_generated'] as const
export type Authorship = (typeof AUTHORSHIPS)[number]

/** chip on cards/rows; 'human' is the default and shows nothing */
export const AUTHORSHIP_CHIP: Record<Authorship, string | null> = {
  human: null,
  ai_assisted: msg('AI 도움'),
  ai_generated: msg('AI 작성'),
}
/** composer trigger label */
export const AUTHORSHIP_LABEL: Record<Authorship, string> = {
  human: msg('직접 씀'),
  ai_assisted: msg('AI 도움'),
  ai_generated: msg('AI 작성'),
}
export const AUTHORSHIP_OPTION: Record<Authorship, { title: string; desc: string }> = {
  human: { title: msg('직접 썼어요'), desc: msg('내 생각을 내 말로 (표시 없음)') },
  ai_assisted: { title: msg('AI 도움을 받았어요'), desc: msg('다듬기·번역·요약 등 AI와 함께 썼어요') },
  ai_generated: { title: msg('AI가 썼어요'), desc: msg('본문 대부분을 AI가 만들었어요') },
}

export function parseAuthorship(v: unknown): Authorship {
  return AUTHORSHIPS.includes(v as Authorship) ? (v as Authorship) : 'human'
}
