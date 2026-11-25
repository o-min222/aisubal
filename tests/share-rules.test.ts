import { describe, expect, it } from 'vitest'
import { postShareData, postShareUrl, shareClipboardText, shareSafeTeaser } from '@/lib/share-rules'

const here = { origin: 'https://aisubal.vercel.app', pathname: '/posts/abc' }
const url = 'https://aisubal.vercel.app/posts/abc'

describe('post share payload (A25 / A101)', () => {
  it('is the post link on this site, without query or hash', () => {
    expect(postShareUrl('/anon/x1', here)).toBe('https://aisubal.vercel.app/anon/x1')
    expect(postShareUrl(undefined, here)).toBe(url)
    expect(postShareUrl('/posts/abc?posted=abc#c', here)).toBe(url)
  })
  it('uses the service name as title and never puts an author or the URL in text', () => {
    const generic = postShareData(url, null)
    expect(generic).toEqual({ url, title: 'AI쓰발' })
    expect(generic).not.toHaveProperty('text')
    const teased = postShareData(url, '요즘 제일 손에 붙은 프롬프트')
    expect(teased).toEqual({ url, title: 'AI쓰발', text: '요즘 제일 손에 붙은 프롬프트' })
    expect(teased.text).not.toContain('https://')
    expect(JSON.stringify(teased)).not.toMatch(/구름|0mins|nickname|@/)
  })
  it('clipboard fallback is the site name, the teaser, then the URL on its own line', () => {
    expect(shareClipboardText(url, null)).toBe(url)
    expect(shareClipboardText(url, '짧은 맛보기')).toBe('AI쓰발\n짧은 맛보기\n' + url)
  })
  it('omits the teaser for private, 부캐, group and anon posts, and never uses an author name', () => {
    expect(shareSafeTeaser({ title: '비밀', visibility: 'friends' })).toBeNull()
    expect(shareSafeTeaser({ title: '비밀', visibility: 'followers' })).toBeNull()
    expect(shareSafeTeaser({ title: '비밀', visibility: 'private' })).toBeNull()
    expect(shareSafeTeaser({ title: '부캐', isNickname: true })).toBeNull()
    expect(shareSafeTeaser({ title: '모임', groupId: 'g1' })).toBeNull()
    expect(shareSafeTeaser({ title: '익명', isOp: true })).toBeNull()
    expect(shareSafeTeaser({ title: '그룹계정', author: { kind: 'group' } })).toBeNull()
    expect(shareSafeTeaser({ title: '전체 회원 글', visibility: 'members' })).toBe('전체 회원 글')
    expect(shareSafeTeaser({ body: '본문만 있는 글입니다' })).toBe('본문만 있는 글입니다')
    expect(shareSafeTeaser({ title: '전체 회원 글', author: { kind: 'member' } })).toBe('전체 회원 글')
  })
})
