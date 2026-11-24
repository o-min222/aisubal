import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canAskQuestion, stripQuestionStarter } from '@/lib/question-rules'
import { QUICK_STARTERS } from '@/lib/quick-post-rules'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A97 · question posts come from the 질문해요 button, not the text (0129)', () => {
  const SQL = read('supabase/migrations/0129_question_flag.sql')
  it('posts.is_question: inserted by the author only, root real-name posts only', () => {
    expect(SQL).toContain('alter table public.posts add column if not exists is_question boolean not null default false;')
    expect(SQL).toContain('grant select (is_question), insert (is_question) on public.posts to authenticated;')
    expect(SQL).not.toMatch(/update \(is_question\)/)
    expect(SQL).toMatch(/not is_question or \(parent_id is null and group_id is null and as_group_id is null and posted_as = 'real' and author_kind = 'member'\)/)
  })
  it('the fan-out keys on the flag; everything else from 0127 stays', () => {
    const fn = SQL.slice(SQL.indexOf('create or replace function public.question__fanout_due'))
    expect(fn).toContain('if not p.is_question or')
    expect(fn).not.toContain('post__is_question(p.content)')
    expect(fn).toContain("coalesce(p.visibility, 'members') = 'private'")
    expect(fn).toContain('v_cap')
    expect(fn).toContain('from public.question_fanouts q where q.post_id = p.id')
    expect(SQL).toContain('revoke all on function public.question__fanout_due(public.posts) from public, anon, authenticated;')
  })
  it('backfill: old starter posts get the flag, nothing is sent (the trigger is insert-only)', () => {
    expect(SQL).toMatch(/update public\.posts set is_question = true\s+where not is_question and public\.post__is_question\(content\)/)
    expect(read('supabase/migrations/0127_question_fanout.sql')).toContain('create trigger posts_notify_question after insert on public.posts')
  })
})

describe('A97 · composer and card', () => {
  it('the existing 질문해요 chip is a switch: it types no sentence', () => {
    const ask = QUICK_STARTERS.find((s) => s.id === 'ask')!
    expect(ask.label).toBe('질문해요')
    expect(ask.prefill).toBeNull()
    const qc = read('src/components/feed/quick-composer.tsx')
    expect(qc).toContain("if (s.id === 'ask') { setQuestion((q) => !q)")
    expect(qc).toContain("aria-pressed={s.id === 'ask' ? question : undefined}")
    expect(qc).toContain('...(question ? { isQuestion: true } : {})')
    expect(qc).toContain('initialQuestion={question}')
    expect(qc).toMatch(/\{question && <span className="q-tag"><T>질문<\/T><\/span>\}/)
  })
  it('the full composer carries it, only for posts that can be questions', () => {
    const c = read('src/components/feed/composer.tsx')
    expect(c).toContain('...(questionable && question ? { isQuestion: true } : {})')
    expect(canAskQuestion({ isReply: false, groupId: null, asGroup: false, postedAs: 'real' })).toBe(true)
    expect(canAskQuestion({ isReply: true, groupId: null, asGroup: false, postedAs: 'real' })).toBe(false)
    expect(canAskQuestion({ isReply: false, groupId: 'g', asGroup: false, postedAs: 'real' })).toBe(false)
    expect(canAskQuestion({ isReply: false, groupId: null, asGroup: true, postedAs: 'real' })).toBe(false)
    expect(canAskQuestion({ isReply: false, groupId: null, asGroup: false, postedAs: 'nickname' })).toBe(false)
  })
  it('the API only honours the flag on eligible posts', () => {
    const r = read('src/app/api/feed/route.ts')
    expect(r).toContain('isQuestion: z.boolean().optional()')
    expect(r).toMatch(/isQuestion: raw\.isQuestion === true && canAskQuestion\(/)
    const p = read('src/lib/data/posts.ts')
    expect(p).toContain('...(input.isQuestion && !input.parentId ? { is_question: true } : {})')
  })
  it('the card shows the 질문 tag before the body and does not repeat an old starter', () => {
    const c = read('src/components/timeline/post-card.tsx')
    expect(c).toMatch(/\{post\.isQuestion && !isReply && <span className="q-tag"><T>질문<\/T><\/span>\}/)
    expect(c).toContain('post.isQuestion ? stripQuestionStarter(plainBody) : plainBody')
    expect(stripQuestionStarter('혹시 이거 아시는 분? Cursor 룰 공유돼요?')).toBe('Cursor 룰 공유돼요?')
    expect(stripQuestionStarter('Does anyone know this?\nsecond')).toBe('second')
    expect(stripQuestionStarter('혹시 이거 아시는 분? ')).toBe('혹시 이거 아시는 분? ')
    expect(stripQuestionStarter('그냥 질문이에요')).toBe('그냥 질문이에요')
    expect(read('src/lib/data/feed.ts')).toContain('like_count, reaction_count, repost_count, is_question, visibility')
  })
})
