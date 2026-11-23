import { describe, expect, it } from 'vitest'
import { actionRequest, inManageTab, manageActions, matchesPerson, parseManageTab, predictRelation } from '@/lib/social-manage'
import { NO_RELATION, type Relation } from '@/lib/social-rules'

const rel = (r: Partial<Relation>): Relation => ({ ...NO_RELATION, ...r })

describe('A48 · 친구·팔로워 관리', () => {
  it('tabs: friends default, legacy ?tab=sent opens 요청', () => {
    expect(parseManageTab(undefined)).toBe('friends')
    expect(parseManageTab('sent')).toBe('requests')
    expect(parseManageTab('followers')).toBe('followers')
    expect(parseManageTab('nope')).toBe('friends')
  })

  it('tab membership comes from the relation; a friend who follows me is also a 팔로워', () => {
    const friendFollower = rel({ friend: 'friends', followsMe: true })
    expect(inManageTab('friends', friendFollower)).toBe(true)
    expect(inManageTab('followers', friendFollower)).toBe(true)
    expect(inManageTab('following', friendFollower)).toBe(false)
    expect(inManageTab('requests', rel({ friend: 'pending_in' }))).toBe(true)
    expect(inManageTab('requests', rel({ friend: 'pending_out' }))).toBe(true)
    expect(inManageTab('followers', rel({ isMe: true, followsMe: true }))).toBe(false)
  })

  it('row menu offers only what applies', () => {
    expect(manageActions(rel({ friend: 'friends', iFollow: true, followsMe: true }))).toEqual(['unfriend', 'unfollow', 'remove_follower'])
    expect(manageActions(rel({ followsMe: true }))).toEqual(['request', 'follow', 'remove_follower'])
    expect(manageActions(rel({ friend: 'pending_out', iFollow: true }))).toEqual(['cancel_request', 'unfollow'])
    expect(manageActions(rel({ friend: 'pending_in' }))).toEqual(['follow'])
    expect(manageActions(rel({ isMe: true }))).toEqual([])
  })

  it('each action hits the existing route (remove follower → its own route)', () => {
    expect(actionRequest('unfriend', 'm')).toEqual({ url: '/api/social/friend', body: { memberId: 'm', action: 'remove' } })
    expect(actionRequest('cancel_request', 'm').body.action).toBe('remove')
    expect(actionRequest('accept', 'm').body.action).toBe('accept')
    expect(actionRequest('unfollow', 'm')).toEqual({ url: '/api/social/follow', body: { memberId: 'm', follow: false } })
    expect(actionRequest('remove_follower', 'm')).toEqual({ url: '/api/social/follower', body: { memberId: 'm' } })
  })

  it('optimistic relation: removing a follower keeps the friendship', () => {
    expect(predictRelation(rel({ friend: 'friends', followsMe: true }), 'remove_follower')).toEqual(rel({ friend: 'friends', followsMe: false }))
    expect(predictRelation(rel({ friend: 'pending_in' }), 'accept').friend).toBe('friends')
    expect(predictRelation(rel({ iFollow: true }), 'unfollow').iFollow).toBe(false)
  })

  it('search matches name or @handle, case-insensitive', () => {
    const p = { name: '프롬프트수집가', handle: 'prompt_jar' }
    expect(matchesPerson(p, '프롬')).toBe(true)
    expect(matchesPerson(p, '@PROMPT')).toBe(true)
    expect(matchesPerson(p, 'zzz')).toBe(false)
    expect(matchesPerson(p, '  ')).toBe(true)
  })
})
