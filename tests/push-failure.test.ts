import { describe, expect, it } from 'vitest'
import { classifyPushError, pushPlan } from '@/lib/push-rules'

const err = (name: string, message: string) => Object.assign(new Error(message), { name })

describe('A50 · push failures are named, never a silent "stays off"', () => {
  it('incognito / InPrivate: granted permission but subscribe refuses', () => {
    expect(classifyPushError(err('AbortError', 'Registration failed - permission denied'), 'granted')).toBe('private')
  })
  it('blocked permission', () => {
    expect(classifyPushError(err('NotAllowedError', 'Permission denied'), 'denied')).toBe('denied')
    expect(classifyPushError(err('AbortError', 'Registration failed - permission denied'), 'denied')).toBe('denied')
  })
  it('push service unreachable (Brave, blocked network)', () => {
    expect(classifyPushError(err('AbortError', 'Registration failed - push service error'), 'granted')).toBe('push_service')
    expect(classifyPushError(err('AbortError', 'Registration failed - push service not available'), 'granted')).toBe('push_service')
  })
  it('service worker never ready', () => {
    expect(classifyPushError(new Error('sw_timeout'), 'granted')).toBe('sw_timeout')
  })
  it('anything else is a generic error', () => {
    expect(classifyPushError(new TypeError('Failed to fetch'), 'granted')).toBe('error')
    expect(classifyPushError(null, 'granted')).toBe('error')
  })
  it('desktop (Windows) Chrome/Edge is not gated to an installed PWA', () => {
    expect(pushPlan({ supported: true, ios: false, standalone: false, permission: 'default' })).toBe('auto')
    expect(pushPlan({ supported: true, ios: false, standalone: false, permission: 'denied' })).toBe('denied')
  })
})
