import { describe, expect, it } from 'vitest'
import { postShareData, postShareUrl, shareClipboardText, shareSafeTitle } from '@/lib/share-rules'

const here = { origin: 'https://aisubal.vercel.app', pathname: '/posts/abc' }

describe('post share payload (A25 / A100)', () => {
  it('is the post link on this site, without query or hash', () => {
    expect(postShareUrl('/anon/x1', here)).toBe('https://aisubal.vercel.app/anon/x1')
    expect(postShareUrl(undefined, here)).toBe('https://aisubal.vercel.app/posts/abc')
    expect(postShareUrl('/posts/abc?posted=abc#c', here)).toBe('https://aisubal.vercel.app/posts/abc')
  })
  it('carries a short title and optional text, never the URL inside text', () => {
    const generic = postShareData('https://aisubal.vercel.app/posts/abc', null)
    expect(generic).toEqual({ url: 'https://aisubal.vercel.app/posts/abc', title: 'AI쓰발' })
    expect(generic).not.toHaveProperty('text')
    const named = postShareData('https://aisubal.vercel.app/posts/abc', '요즘 제일 손에 붙은 프롬프트')
    expect(named.title).toBe('요즘 제일 손에 붙은 프롬프트')
    expect(named.text).toBe(named.title)
    expect(named.text).not.toContain('https://')
    expect(postShareData('u', 'x'.repeat(100)).title).toHaveLength(40)
  })
  it('clipboard fallback is title plus the URL on its own line', () => {
    expect(shareClipboardText('https://aisubal.vercel.app/posts/abc', null)).toBe('https://aisubal.vercel.app/posts/abc')
    expect(shareClipboardText('https://aisubal.vercel.app/posts/abc', '짧은 제목')).toBe('짧은 제목\nhttps://aisubal.vercel.app/posts/abc')
  })
  it('omits the title for private, 부캐, group and anon posts', () => {
    expect(shareSafeTitle({ title: '비밀', visibility: 'friends' })).toBeNull()
    expect(shareSafeTitle({ title: '비밀', visibility: 'followers' })).toBeNull()
    expect(shareSafeTitle({ title: '비밀', visibility: 'private' })).toBeNull()
    expect(shareSafeTitle({ title: '부캐', isNickname: true })).toBeNull()
    expect(shareSafeTitle({ title: '모임', groupId: 'g1' })).toBeNull()
    expect(shareSafeTitle({ title: '익명', isOp: true })).toBeNull()
    expect(shareSafeTitle({ title: '그룹계정', author: { kind: 'group' } })).toBeNull()
    expect(shareSafeTitle({ title: '전체 회원 글', visibility: 'members' })).toBe('전체 회원 글')
    expect(shareSafeTitle({ title: '전체 회원 글' })).toBe('전체 회원 글')
  })
})
