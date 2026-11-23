/** A54: pure rules for the first-question mission. */
export const MISSION_MIN = 10
export const MISSION_MAX = 1500

/** the first post reads as the question and the answer */
export function missionPostBody(question: string | null, answer: string): string {
  const a = answer.trim()
  return question ? `Q. ${question.trim()}\n\n${a}` : a
}

export function missionAnswerError(answer: string): string | null {
  const n = answer.trim().length
  if (n < MISSION_MIN) return '조금만 더 적어 주세요 (10자 이상).'
  if (n > MISSION_MAX) return '1500자까지 쓸 수 있어요.'
  return null
}
