/**
 * A102: one key rule for every composer (feed, expanded, comments/replies, groups, anon, 물어보기).
 *
 * Touch / coarse-pointer: Enter is always a newline; posting is the button only.
 * Desktop: Enter (and Shift+Enter) insert a newline; Cmd/Ctrl+Enter submits.
 * IME composition (Korean syllable commit: isComposing or keyCode 229) never submits.
 */
type ComposerKeyEvent = {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  repeat?: boolean
  keyCode?: number
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean }
}

export function isImeComposing(e: ComposerKeyEvent): boolean {
  return !!(e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229)
}

/** Soft-keyboard Return is a newline on phones and other coarse pointers. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches
}

/**
 * True when this key should submit the composer.
 * Callers must preventDefault and then post. A held key does not re-submit.
 */
export function composerKeySubmits(e: ComposerKeyEvent, touch: boolean): boolean {
  if (e.key !== 'Enter' || e.repeat) return false
  if (isImeComposing(e)) return false
  if (e.shiftKey || e.altKey) return false
  if (touch) return false
  return !!(e.metaKey || e.ctrlKey)
}

/** Soft-keyboard hint: the Return key inserts a newline, it does not send. */
export const COMPOSER_ENTER_KEY_HINT = 'enter' as const
