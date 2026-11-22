'use client'

import type { ReactNode } from 'react'

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
}) {
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

/** Auto-growing textarea for composers (no character counter). */
export function ComposerTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { onSubmitShortcut?: () => void }) {
  const { onSubmitShortcut, className = '', onKeyDown, onInput, ...rest } = props
  return (
    <textarea
      {...rest}
      className={`composer-input ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitShortcut?.()
        onKeyDown?.(e)
      }}
      onInput={(e) => {
        const el = e.currentTarget
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 480)}px`
        onInput?.(e)
      }}
    />
  )
}
