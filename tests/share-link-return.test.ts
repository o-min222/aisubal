import { describe, expect, it } from 'vitest'
import { loginReturnPath, safeNextPath, sharedPostKind } from '@/lib/handoff-rules'

describe('shared links opened signed out (A25)', () => {
  it('sign-in returns to the shared post, query included', () => {
    expect(loginReturnPath('/posts/931599e3-7d7e-4838-a146-cac04778802b')).toBe('/posts/931599e3-7d7e-4838-a146-cac04778802b')
    expect(loginReturnPath('/anon/abc12345-0000', '?c=1')).toBe('/anon/abc12345-0000?c=1')
    expect(loginReturnPath('/groups/ai-lab')).toBe('/groups/ai-lab')
  })
  it('nothing to carry for the default landing pages', () => {
    for (const p of ['/', '/feed', '/login']) expect(loginReturnPath(p)).toBeNull()
  })
  it('never an outside address', () => {
    expect(loginReturnPath('//evil.example/x')).toBeNull()
    expect(safeNextPath('https://evil.example')).toBeNull()
  })
  it('the sign-in page knows a shared post from any other page', () => {
    expect(sharedPostKind('/posts/931599e3-7d7e-4838-a146-cac04778802b')).toBe('post')
    expect(sharedPostKind('/agora/931599e3-7d7e')).toBe('agora')
    expect(sharedPostKind('/anon/931599e3?x=1')).toBe('anon')
    expect(sharedPostKind('/posts/new')).toBeNull()
    expect(sharedPostKind('/settings')).toBeNull()
    expect(sharedPostKind(null)).toBeNull()
  })
})
