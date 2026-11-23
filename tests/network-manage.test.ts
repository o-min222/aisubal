import { describe, expect, it } from 'vitest'
import { cleanPeopleQuery, filterPeople, networkFeedHref, networkHref } from '@/lib/dashboard-tabs'

const people = [{ name: '김 민수' }, { name: 'Cloud' }, { name: '0mins' }]

describe('managing following / friends (A26)', () => {
  it('finds people by name, ignoring case and spaces', () => {
    expect(filterPeople(people, '김민').map((p) => p.name)).toEqual(['김 민수'])
    expect(filterPeople(people, 'CLOUD').map((p) => p.name)).toEqual(['Cloud'])
    expect(filterPeople(people, '  ')).toHaveLength(3)
    expect(filterPeople(people, 'zzz')).toEqual([])
  })
  it('the list URL carries the search; blank searches are dropped', () => {
    expect(networkHref({ view: 'following', q: ' 민수 ' })).toBe('/me?tab=network&view=following&q=%EB%AF%BC%EC%88%98')
    expect(networkHref({ view: 'friends', q: '' })).toBe('/me?tab=network&view=friends')
    expect(cleanPeopleQuery('x'.repeat(99))).toHaveLength(40)
  })
  it('following and friends lists jump to that feed tab; others have no posts tab', () => {
    expect(networkFeedHref('following')).toBe('/feed?scope=following')
    expect(networkFeedHref('friends')).toBe('/feed?scope=friends')
    expect(networkFeedHref('followers')).toBeNull()
    expect(networkFeedHref('requests')).toBeNull()
  })
})
