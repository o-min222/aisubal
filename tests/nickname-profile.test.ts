import { describe, it, expect } from 'vitest'
import {
  canPostAs,
  isNicknameUnlocked,
  toPublicAuthor,
  toPublicPost,
  assertNoIdentityLeak,
  collectForbiddenKeys,
  DEV_NICKNAME_UNLOCK_THRESHOLD,
  DEFAULT_NICKNAME_UNLOCK_THRESHOLD,
  nicknameProfilePublicId,
} from '@/lib/profile'
import { MOCK_MEMBERS, MOCK_POSTS, MOCK_SITE_SETTINGS } from '@/lib/mock-data'
import type { Member, Post } from '@/lib/supabase/types'

const realMember = MOCK_MEMBERS[0] // has nickname
const noNickMember = MOCK_MEMBERS[2]

describe('별명 프로필 임계값 게이팅', () => {
  it('기본 임계값은 100이다', () => {
    expect(DEFAULT_NICKNAME_UNLOCK_THRESHOLD).toBe(100)
    expect(isNicknameUnlocked(99, 100)).toBe(false)
    expect(isNicknameUnlocked(100, 100)).toBe(true)
  })

  it('dev 시드 임계값은 낮아서 양쪽 모드를 리뷰할 수 있다', () => {
    expect(MOCK_SITE_SETTINGS.nickname_unlock_threshold).toBe(DEV_NICKNAME_UNLOCK_THRESHOLD)
    expect(DEV_NICKNAME_UNLOCK_THRESHOLD).toBeLessThan(10)
    expect(isNicknameUnlocked(3, DEV_NICKNAME_UNLOCK_THRESHOLD)).toBe(true)
  })

  it('언락 전에는 nickname으로 게시할 수 없다', () => {
    const r = canPostAs(realMember, 'nickname', false)
    expect(r.ok).toBe(false)
  })

  it('언락 후 별명 프로필이 없으면 nickname 게시 불가', () => {
    const r = canPostAs(noNickMember, 'nickname', true)
    expect(r.ok).toBe(false)
  })

  it('언락 + 별명 프로필이 있으면 nickname 게시 가능', () => {
    expect(canPostAs(realMember, 'nickname', true).ok).toBe(true)
    expect(canPostAs(realMember, 'real', true).ok).toBe(true)
  })
})

describe('게시물별 프로필 선택', () => {
  it('실명 게시는 display_name을 노출하고 member id를 쓴다', () => {
    const author = toPublicAuthor(realMember, 'real')
    expect(author.kind).toBe('real')
    if (author.kind === 'real') {
      expect(author.display_name).toBe(realMember.display_name)
      expect(author.id).toBe(realMember.id)
    }
  })

  it('별명 게시는 nickname만 노출하고 member id를 쓰지 않는다', () => {
    const author = toPublicAuthor(realMember, 'nickname')
    expect(author.kind).toBe('nickname')
    if (author.kind === 'nickname') {
      expect(author.nickname).toBe(realMember.nickname)
      expect(author.id).toBe(nicknameProfilePublicId(realMember.nickname_id!))
      expect(author.id).not.toContain(realMember.id.replace(/-/g, '').slice(0, 8))
    }
  })

  it('시드에 실명/별명 게시가 모두 있다', () => {
    expect(MOCK_POSTS.some((p) => p.posted_as === 'real')).toBe(true)
    expect(MOCK_POSTS.some((p) => p.posted_as === 'nickname')).toBe(true)
  })
})

describe('실명/별명 연결 및 이메일 유출 방지', () => {
  const secrets = MOCK_MEMBERS.map((m) => m.email)

  it('공개 게시물 페이로드에 email/author_id가 없다', () => {
    for (const post of MOCK_POSTS) {
      const member = MOCK_MEMBERS.find((m) => m.id === post.author_id)!
      const pub = toPublicPost(post, member, { archive_count: post.archive_count })
      expect(collectForbiddenKeys(pub)).toEqual([])
      assertNoIdentityLeak(pub, secrets)
      // nickname posts must not embed real display_name
      if (post.posted_as === 'nickname') {
        const text = JSON.stringify(pub)
        expect(text).not.toContain(member.display_name)
        expect(text).not.toContain(member.email)
        expect(text).not.toContain(member.id)
      }
    }
  })

  it('별명 프로필이 없어도 별명 게시는 실명으로 바뀌지 않는다', () => {
    const bare = { ...realMember, nickname: null, nickname_bio: null, nickname_avatar_url: null, nickname_id: null }
    const author = toPublicAuthor(bare, 'nickname')
    expect(author.kind).toBe('nickname')
    expect(JSON.stringify(author)).not.toContain(realMember.display_name)
    expect(JSON.stringify(author)).not.toContain(realMember.id)
  })

  it('별명 작성자 객체에 실명 필드가 없다', () => {
    const author = toPublicAuthor(realMember, 'nickname')
    expect(author).not.toHaveProperty('display_name')
    expect(author).not.toHaveProperty('email')
    expect(JSON.stringify(author)).not.toContain(realMember.display_name)
    expect(JSON.stringify(author)).not.toContain(realMember.email)
  })

  it('초대 트리용 실명 멤버 목록은 별명 핸들을 공개 필드로 섞지 않는다', () => {
    // Invite tree is real-account graph; nicknames are not nodes
    const treeNodes = MOCK_MEMBERS.map((m) => ({
      id: m.id,
      display_name: m.display_name,
    }))
    for (const node of treeNodes) {
      expect(node).not.toHaveProperty('nickname')
      expect(node).not.toHaveProperty('email')
    }
  })
})

describe('부캐 posts in the single-post API / MCP read_post (nickname-only author)', () => {
  it('toPublicPostView keeps the hydrated 부캐 author and never the member', async () => {
    const { toPublicPostView } = await import('@/lib/profile')
    const post = MOCK_POSTS.find((p) => p.posted_as === 'nickname')!
    const member = MOCK_MEMBERS.find((m) => m.id === post.author_id)!
    const pub = toPublicPostView({ ...post, author: toPublicAuthor(member, 'nickname') })
    expect(pub.author.kind).toBe('nickname')
    const text = JSON.stringify(pub)
    expect(text).not.toContain(member.id)
    expect(text).not.toContain(member.display_name)
    expect(collectForbiddenKeys(pub)).toEqual([])
  })
})
