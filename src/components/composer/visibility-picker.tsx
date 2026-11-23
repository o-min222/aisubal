'use client'

import { useState } from 'react'
import { Check, Lock, UserCheck, Users, Handshake } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { POST_VISIBILITIES, POST_VISIBILITY_OPTION, type PostVisibility } from '@/lib/post-visibility'

export const VISIBILITY_ICON = { members: Users, followers: UserCheck, friends: Handshake, private: Lock } as const

/** A43: 공유범위 — same compact button + popover as the agent-reaction picker */
export function VisibilityPicker({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: PostVisibility
  onChange: (v: PostVisibility) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const Icon = VISIBILITY_ICON[value]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`agent-react-btn ${className}`}
        disabled={disabled}
        aria-label={tx('공유범위: {label}', { label: tx(POST_VISIBILITY_OPTION[value].title) })}
        data-visibility-btn
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate"><T>{POST_VISIBILITY_OPTION[value].title}</T></span>
      </PopoverTrigger>
      <PopoverContent align="start" className="agent-react-pop w-[min(296px,calc(100vw-24px))] p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-n-888"><T>누가 볼 수 있나요?</T></p>
        <div role="radiogroup" aria-label={tx('공유범위')}>
          {POST_VISIBILITIES.map((v) => {
            const O = POST_VISIBILITY_OPTION[v]
            const I = VISIBILITY_ICON[v]
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={value === v}
                className="agent-react-opt"
                data-visibility={v}
                onClick={() => {
                  onChange(v)
                  setOpen(false)
                }}
              >
                <span className="agent-react-ico"><I className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[14px] font-semibold text-n-111"><T>{O.title}</T></span>
                  <span className="block text-[12.5px] text-n-666"><T>{O.desc}</T></span>
                </span>
                {value === v && <Check className="w-4 h-4 text-n-111 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
