'use client'

import { useRef, type ReactNode } from 'react'
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

/** Auto-growing textarea for composers (no character counter). `mentions` adds @-autocomplete. */
export function ComposerTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { onSubmitShortcut?: () => void; mentions?: boolean }) {
  const { onSubmitShortcut, mentions = false, className = '', onKeyDown, onInput, onBlur, onFocus, enterKeyHint, ...rest } = props
  const ref = useRef<HTMLTextAreaElement>(null)
  const lastSend = useRef(0)
  const ms = useMentionSuggest(ref, mentions)
  const textarea = (
    <textarea
      {...rest}
      {...ms.inputProps}
      ref={ref}
      className={`composer-input ${className}`}
      enterKeyHint={enterKeyHint ?? COMPOSER_ENTER_KEY_HINT}
      onKeyDown={(e) => {
        if (ms.onKeyDown(e)) return
        // A102: desktop Cmd/Ctrl+Enter submits; plain Enter is a newline; touch is button-only
        if (composerKeySubmits(e, isCoarsePointer())) {
          e.preventDefault()
          if (e.currentTarget.value.trim() && Date.now() - lastSend.current > 800) {
            lastSend.current = Date.now()
            onSubmitShortcut?.()
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
        const el = e.currentTarget
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 480)}px`
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
