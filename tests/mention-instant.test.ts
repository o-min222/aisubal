import { describe, expect, it } from 'vitest'
import { applyMention, choseong, mentionQueryAt, mergeSuggestions, placeMentionPopover, rankLocal } from '@/lib/mention-rules'

const m = (handle: string, name: string, kind: 'member' | 'agent' = 'member') => ({ kind, handle, name })
const circle = [m('minsu', '김민수'), m('cloud', 'Cloud'), m('mina', '박민아'), m('night', '야간 리서처', 'agent')]

describe('instant @-suggestions (A27)', () => {
  it('a bare @ shows your circle right away, friends first', () => {
    expect(rankLocal(circle, '').map((i) => i.handle)).toEqual(['minsu', 'cloud', 'mina', 'night'])
  })
  it('handle prefix beats name match; Korean names match too', () => {
    expect(rankLocal(circle, 'mi').map((i) => i.handle)).toEqual(['minsu', 'mina'])
    expect(rankLocal(circle, '민').map((i) => i.handle)).toEqual(['minsu', 'mina'])
    expect(rankLocal(circle, '박민').map((i) => i.handle)).toEqual(['mina'])
  })
  it('Korean IME: a half-typed syllable keeps the list; initials alone match', () => {
    expect(rankLocal(circle, '김ㅁ').map((i) => i.handle)).toEqual(['minsu'])
    expect(rankLocal(circle, 'ㄱㅁ').map((i) => i.handle)).toEqual(['minsu'])
    expect(choseong('야간 리서처')).toBe('ㅇㄱ ㄹㅅㅊ')
    expect(mentionQueryAt('안녕 @김ㅁ', 7)).toEqual({ start: 3, query: '김ㅁ' })
    expect(applyMention('@김ㅁ hi', 0, 3, { kind: 'member', handle: 'minsu' }).text).toBe('@minsu hi')
  })
  it('server hits join after the circle, no duplicates', () => {
    const r = mergeSuggestions([m('minsu', '김민수')], [m('minsu', '김민수'), m('minho', '이민호')])
    expect(r.map((i) => i.handle)).toEqual(['minsu', 'minho'])
  })
  it('the popover sits under the caret, flips above near the bottom (keyboard), stays on screen', () => {
    const vp = { left: 0, top: 0, w: 390, h: 500 }
    expect(placeMentionPopover({ x: 100, top: 200, bottom: 220 }, { w: 320, h: 200 }, vp)).toEqual({ left: 62, top: 224, above: false })
    expect(placeMentionPopover({ x: 10, top: 420, bottom: 440 }, { w: 300, h: 200 }, vp)).toEqual({ left: 10, top: 216, above: true })
    expect(placeMentionPopover({ x: 2, top: 100, bottom: 120 }, { w: 100, h: 50 }, vp).left).toBe(8)
  })
})

describe('initials match word starts only (A27)', () => {
  it('ㄱ does not match a name that merely contains ㄱ', () => {
    const c = [{ kind: 'member' as const, handle: 'p', name: '프롬프트수집가' }, { kind: 'agent' as const, handle: 'n', name: '야간 리서처' }, { kind: 'member' as const, handle: 'k', name: '김민수' }]
    expect(rankLocal(c, 'ㄱ').map((i) => i.handle)).toEqual(['k'])
    expect(rankLocal(c, 'ㄹㅅ').map((i) => i.handle)).toEqual(['n'])
  })
})
