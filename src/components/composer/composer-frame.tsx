'use client'

import { autosizeTextarea } from '@/lib/autosize-textarea'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { COMPOSER_ENTER_KEY_HINT, composerKeySubmits, isCoarsePointer } from '@/lib/composer-keys'
import { useMentionSuggest } from './mention-suggest'

/**
 * Shared composer layout (feed, group, anon, replies): avatar + body, text that
 * wraps, and one slim footer row: 32px icon controls on the left, a small
 * rounded submit on the right that never shrinks or overflows.
 */
export function ComposerFrame({
  avatar,
  head,
  children,
  tools,
  submitLabel,
  onSubmit,
  canSubmit,
  busy,
  className = '',
  compact = false,
}: {
  avatar: ReactNode
  head?: ReactNode
  children: ReactNode
  tools?: ReactNode
  submitLabel: ReactNode
  onSubmit: () => void
  canSubmit: boolean
  busy?: boolean
  className?: string
  /** A44: replies — one growing line, no avatar/name, a small text send; tools become a muted note below */
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className={`composer-compact ${className}`}>
        <div className="composer-compact-field">
          <div className="composer-body">{children}</div>
          <button type="button" onClick={onSubmit} disabled={!canSubmit || busy} className="composer-send">
            {submitLabel}
          </button>
        </div>
        {tools && <div className="composer-compact-note">{tools}</div>}
      </div>
    )
  }
  return (
    <div className={`composer ${className}`}>
      <div className="composer-avatar">{avatar}</div>
      <div className="composer-body">
        {head && <div className="composer-head">{head}</div>}
        {children}
        <div className="composer-foot">
          <div className="composer-tools">{tools}</div>
          <button type="button" onClick={onSubmit} disabled={!canSubmit || busy} className="composer-submit">
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The one composer field (A149: feed, replies, group, 익명, quick composer, article comments).
 * Grows with its text up to `autosize` px (false: a plain fixed field). `mentions` adds
 * @-autocomplete. With onSubmitShortcut, desktop Cmd/Ctrl+Enter submits. `bare` drops the
 * composer-input look for surfaces with their own field style.
 */
export function ComposerTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    onSubmitShortcut?: () => void
    mentions?: boolean
    autosize?: number | false
    bare?: boolean
    ref?: React.RefObject<HTMLTextAreaElement | null>
  }
) {
  const { onSubmitShortcut, mentions = false, autosize = 480, bare = false, className = '', onKeyDown, onInput, onBlur, onFocus, enterKeyHint, ref: outer, ...rest } = props
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = outer ?? own
  const lastSend = useRef(0)
  const ms = useMentionSuggest(ref, mentions)
  // prefilled or restored text must be fully visible (the field no longer shows a scrollbar until it hits its cap)
  useLayoutEffect(() => { if (ref.current && autosize) autosizeTextarea(ref.current, autosize) }, [rest.value, autosize, ref])
  const textarea = (
    <textarea
      {...rest}
      {...ms.inputProps}
      ref={ref}
      className={bare ? className : `composer-input ${className}`}
      enterKeyHint={enterKeyHint ?? COMPOSER_ENTER_KEY_HINT}
      onKeyDown={(e) => {
        if (ms.onKeyDown(e)) return
        // A102: desktop Cmd/Ctrl+Enter submits; plain Enter is a newline; touch is button-only
        if (onSubmitShortcut && composerKeySubmits(e, isCoarsePointer())) {
          e.preventDefault()
          if (e.currentTarget.value.trim() && Date.now() - lastSend.current > 800) {
            lastSend.current = Date.now()
            onSubmitShortcut()
          }
          return
        }
        onKeyDown?.(e)
      }}
      onKeyUp={mentions ? ms.update : undefined}
      onClick={mentions ? ms.update : undefined}
      onFocus={(e) => {
        if (mentions) ms.prefetch()
        onFocus?.(e)
      }}
      onCompositionEnd={mentions ? ms.update : undefined}
      onBlur={(e) => {
        if (mentions) ms.close()
        onBlur?.(e)
      }}
      onInput={(e) => {
        if (autosize) autosizeTextarea(e.currentTarget, autosize)
        if (mentions) ms.update()
        onInput?.(e)
      }}
    />
  )
  if (!mentions) return textarea
  return (
    <div className="composer-input-wrap">
      {textarea}
      {ms.popover}
    </div>
  )
}
