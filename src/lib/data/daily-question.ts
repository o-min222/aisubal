import { isMock, sb } from './client'
import { kstDate, questionIndex, type DailyQuestion } from '@/lib/quick-post-rules'

export type AdminQuestion = { id: string; ko: string; en: string | null; active: boolean; sort: number }

type Mock = { items: AdminQuestion[]; answered: Set<string>; answers: number }
const g = globalThis as unknown as { __aisubalDq?: Mock }
function mock(): Mock {
  if (!g.__aisubalDq) {
    const seed: Array<[string, string]> = [
      ['오늘 AI한테 처음 물어본 건 뭐였어요?', 'What was the first thing you asked an AI today?'],
      ['AI가 최근에 제일 웃기게 틀린 답은?', "What's the funniest wrong answer an AI gave you lately?"],
      ['요즘 제일 자주 여는 AI 앱 하나만 꼽는다면?', 'If you had to pick one AI app you open the most, which is it?'],
      ['아끼는 프롬프트 한 줄 공유해 주세요.', 'Share one prompt line you really like.'],
    ]
    g.__aisubalDq = { items: seed.map(([ko, en], i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, ko, en, active: true, sort: (i + 1) * 10 })), answered: new Set(), answers: 3 }
  }
  return g.__aisubalDq
}
function mockToday(): AdminQuestion | null {
  const act = mock().items.filter((q) => q.active).sort((a, b) => a.sort - b.sort)
  return act.length ? act[questionIndex(kstDate(), act.length)] : null
}
/** mock-only: the tag a post gets when it answers today's question */
export function mockQuestionTag(id: string | null | undefined) {
  const q = mockToday()
  if (!id || !q || q.id !== id) return null
  mock().answered.add(q.id)
  mock().answers += 1
  return { id: q.id, ko: q.ko, en: q.en, date: kstDate() }
}

export async function getTodayQuestion(): Promise<DailyQuestion | null> {
  if (isMock()) {
    const q = mockToday()
    return q ? { id: q.id, ko: q.ko, en: q.en, date: kstDate(), answered: mock().answered.has(q.id), answers: mock().answers } : null
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('daily_question_today')
  if (error) throw error
  return (data as DailyQuestion | null) ?? null
}

export async function adminListQuestions(): Promise<{ today: string | null; items: AdminQuestion[] }> {
  if (isMock()) return { today: mockToday()?.id ?? null, items: [...mock().items].sort((a, b) => a.sort - b.sort) }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('daily_questions_admin')
  if (error) throw error
  const d = (data ?? {}) as { today?: string | null; items?: AdminQuestion[] }
  return { today: d.today ?? null, items: d.items ?? [] }
}

export async function adminSaveQuestion(input: { id?: string | null; ko: string; en?: string | null; active?: boolean }) {
  if (isMock()) {
    const m = mock()
    const hit = input.id ? m.items.find((q) => q.id === input.id) : null
    if (hit) Object.assign(hit, { ko: input.ko, en: input.en || null, active: input.active ?? hit.active })
    else m.items.push({ id: crypto.randomUUID(), ko: input.ko, en: input.en || null, active: input.active ?? true, sort: Math.max(0, ...m.items.map((q) => q.sort)) + 10 })
    return adminListQuestions()
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('daily_question_save', { p_id: input.id ?? null, p_ko: input.ko, p_en: input.en ?? null, p_active: input.active ?? true })
  if (error) throw error
  return adminListQuestions()
}

export async function adminDeleteQuestion(id: string) {
  if (isMock()) {
    const m = mock()
    m.items = m.items.filter((q) => q.id !== id)
    return adminListQuestions()
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('daily_question_delete', { p_id: id })
  if (error) throw error
  return adminListQuestions()
}
