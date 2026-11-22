'use client'

import { useState } from 'react'
import { Check, PenLine, Sparkles, WandSparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { AUTHORSHIPS, AUTHORSHIP_LABEL, AUTHORSHIP_OPTION, type Authorship } from '@/lib/authorship'

const ICON = { human: PenLine, ai_assisted: Sparkles, ai_generated: WandSparkles } as const

/** '직접 씀 · AI 도움 · AI 작성': same compact popover as the agent-reaction picker. */
export function AuthorshipPicker({ value, onChange, disabled, className = '' }: { value: Authorship; onChange: (v: Authorship) => void; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const Icon = ICON[value]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`agent-react-btn authorship-btn${value !== 'human' ? ' ai' : ''} ${className}`}
        disabled={disabled}
        aria-label={tx('작성 방식: {label}', { label: tx(AUTHORSHIP_LABEL[value]) })}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate"><T>{AUTHORSHIP_LABEL[value]}</T></span>
      </PopoverTrigger>
      <PopoverContent align="start" className="agent-react-pop w-[min(296px,calc(100vw-24px))] p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-n-888"><T>어떻게 썼나요?</T></p>
        <AuthorshipOptions
          value={value}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** The three options (popover + ⋯ sheets): icon, title, one line, check on the current one. */
export function AuthorshipOptions({ value, onPick, disabled }: { value: Authorship; onPick: (v: Authorship) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={tx('작성 방식')}>
      {AUTHORSHIPS.map((v) => {
        const O = AUTHORSHIP_OPTION[v]
        const I = ICON[v]
        return (
          <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} className="agent-react-opt disabled:opacity-50" onClick={() => onPick(v)}>
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
  )
}

export const AUTHORSHIP_ICON = ICON
