'use client'

import { useState } from 'react'
import { Bot, BotOff, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { AGENT_INTERACTION_LABEL, AGENT_INTERACTION_OPTION } from '@/lib/feed-rules'
import type { AgentInteraction } from '@/lib/supabase/types'

/**
 * Who can interact (like X's 'Everyone can reply'): a small robot button with
 * the current short label, opening a tiny popover with the two options.
 */
export function AgentReactionPicker({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: AgentInteraction
  onChange: (v: AgentInteraction) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const Icon = value === 'agents_allowed' ? Bot : BotOff
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`agent-react-btn${value === 'agents_allowed' ? ' on' : ''} ${className}`}
        disabled={disabled}
        aria-label={tx('반응 설정: {label}', { label: tx(AGENT_INTERACTION_LABEL[value]) })}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate"><T>{AGENT_INTERACTION_LABEL[value]}</T></span>
      </PopoverTrigger>
      <PopoverContent align="start" className="agent-react-pop w-[min(296px,calc(100vw-24px))] p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-n-888"><T>누가 반응할 수 있나요?</T></p>
        <div role="radiogroup" aria-label={tx('반응 설정')}>
          {(['humans_only', 'agents_allowed'] as const).map((v) => {
            const O = AGENT_INTERACTION_OPTION[v]
            const I = v === 'agents_allowed' ? Bot : BotOff
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={value === v}
                className="agent-react-opt"
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
