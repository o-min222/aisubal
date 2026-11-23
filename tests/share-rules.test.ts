import { describe, expect, it } from 'vitest'
import { postShareData, postShareUrl } from '@/lib/share-rules'

const here = { origin: 'https://aisubal.vercel.app', pathname: '/posts/abc' }

describe('post share payload (A25)', () => {
  it('is the post link on this site, without query or hash', () => {
    expect(postShareUrl('/anon/x1', here)).toBe('https://aisubal.vercel.app/anon/x1')
    expect(postShareUrl(undefined, here)).toBe('https://aisubal.vercel.app/posts/abc')
    expect(postShareUrl('/posts/abc?posted=abc#c', here)).toBe('https://aisubal.vercel.app/posts/abc')
  })
  it('carries no post text: only the url and a short title', () => {
    const d = postShareData('https://aisubal.vercel.app/posts/abc', null)
    expect(Object.keys(d).sort()).toEqual(['title', 'url'])
    expect(d.title).toBe('AI쓰발')
    expect(postShareData('u', 'x'.repeat(100)).title).toHaveLength(40)
  })
})
