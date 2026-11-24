import { canRestrict } from '@/lib/post-visibility'

/**
 * A97 (0129): a question is a post its author marked with the composer's 질문해요 button
 * (posts.is_question). Only a root, real-name, non-group post can be one — the same posts that can be restricted.
 */
export const canAskQuestion = canRestrict

/** the text A93 (0127) detected: posts written with it before the flag existed were backfilled */
const LEGACY_STARTER = /^\s*(혹시 이거 아시는 분\?|Does anyone know this\?)\s*/

/**
 * A flagged post that still opens with the old starter shows the 질문 tag instead of repeating it.
 * Never returns an empty body: a post that was only the starter keeps its text.
 */
export function stripQuestionStarter(body: string): string {
  const rest = body.replace(LEGACY_STARTER, '')
  return rest.trim() ? rest : body
}
