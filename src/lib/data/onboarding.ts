import { sb, isMock } from './client'
import { createPost } from './posts'
import type { Member } from '@/lib/supabase/types'
import { missionPostBody } from '@/lib/onboarding-rules'

/** A54: the first-question mission (0104). */
export type MissionPrompt = { id: string; ko: string; en: string | null; done: boolean }
export type AdminPrompt = { id: string; ko: string; en: string | null; active: boolean; sort: number }

type MockState = { prompts: AdminPrompt[]; done: Set<string> }
function mock(): MockState {
  const g = globalThis as unknown as { __aisubalPrompts?: MockState }
  g.__aisubalPrompts ??= {
    prompts: [
      { id: 'p1', ko: '요즘 제일 손에 붙은 AI 워크플로 하나만 소개해 주세요.', en: 'Share one AI workflow that has really stuck with you lately.', active: true, sort: 10 },
      { id: 'p2', ko: 'AI 덕분에 최근에 아낀 시간, 어디서 아꼈나요?', en: 'Where did AI save you time recently?', active: true, sort: 20 },
      { id: 'p3', ko: '지금 쓰는 AI 툴 조합(스택)과 이유를 알려 주세요.', en: 'What is your current AI tool stack, and why?', active: true, sort: 30 },
      { id: 'p4', ko: 'AI로 해보고 싶은데 아직 못 푼 문제가 있나요?', en: "Is there a problem you want to solve with AI but haven't cracked yet?", active: true, sort: 40 },
    ],
    done: new Set(),
  }
  return g.__aisubalPrompts
}

export async function getMyPrompt(memberId: string): Promise<MissionPrompt | null> {
  if (isMock()) {
    const act = mock().prompts.filter((p) => p.active).sort((a, b) => a.sort - b.sort)
    if (!act.length) return null
    const p = act[[...memberId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % act.length]
    return { id: p.id, ko: p.ko, en: p.en, done: mock().done.has(memberId) }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('onboarding_prompt_mine')
  if (error) throw error
  return (data as MissionPrompt | null) ?? null
}

export class MissionError extends Error {}

/** post the answer (전체 회원, real name) and mark the mission done; A55 alerts fire inside the RPC */
export async function completeMission(member: Member, answer: string, locale: 'ko' | 'en'): Promise<{ postId: string; first: boolean }> {
  const prompt = await getMyPrompt(member.id)
  const question = prompt ? (locale === 'en' && prompt.en) || prompt.ko : null
  const { details } = await createPost(member, { content: missionPostBody(question, answer), visibility: 'members', postedAs: 'real' })
  if (isMock()) {
    const first = !mock().done.has(member.id)
    mock().done.add(member.id)
    return { postId: details.id, first }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('onboarding_mission_complete', { p_post: details.id })
  if (error) throw new MissionError(error.message)
  return { postId: details.id, first: Boolean((data as { first?: boolean } | null)?.first) }
}

export async function adminListPrompts(): Promise<AdminPrompt[]> {
  if (isMock()) return [...mock().prompts].sort((a, b) => a.sort - b.sort)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('onboarding_prompts_admin')
  if (error) throw error
  return (data as AdminPrompt[]) ?? []
}

export async function adminSavePrompt(input: { id?: string | null; ko: string; en?: string | null; active?: boolean }): Promise<AdminPrompt[]> {
  if (isMock()) {
    const st = mock()
    const cur = input.id ? st.prompts.find((p) => p.id === input.id) : null
    if (cur) Object.assign(cur, { ko: input.ko, en: input.en || null, active: input.active ?? cur.active })
    else st.prompts.push({ id: `p${Date.now()}`, ko: input.ko, en: input.en || null, active: input.active ?? true, sort: Math.max(0, ...st.prompts.map((p) => p.sort)) + 10 })
    return adminListPrompts()
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('onboarding_prompt_save', { p_id: input.id ?? null, p_ko: input.ko, p_en: input.en ?? null, p_active: input.active ?? true, p_sort: null })
  if (error) throw error
  return adminListPrompts()
}

export async function adminDeletePrompt(id: string): Promise<AdminPrompt[]> {
  if (isMock()) {
    mock().prompts = mock().prompts.filter((p) => p.id !== id)
    return adminListPrompts()
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('onboarding_prompt_delete', { p_id: id })
  if (error) throw error
  return adminListPrompts()
}
