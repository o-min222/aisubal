'use client'

import { useState } from 'react'
import { Check, Hash } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ANON_CATEGORIES, type AnonCategory } from '@/lib/anon-rules'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/** One small "# 주제" button in the composer's tool row (same shape as the reaction picker). */
export function AnonTopicPicker({ value, onChange }: { value: AnonCategory | null; onChange: (v: AnonCategory) => void }) {
  const [open, setOpen] = useState(false)
  const label = ANON_CATEGORIES.find((c) => c.id === value)?.label
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={`agent-react-btn topic-btn${value ? ' on' : ''}`} aria-label={tx('주제: {label}', { label: label ? tx(label) : tx('고르기') })}>
        <Hash className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{label ? <T>{label}</T> : <T>주제 고르기</T>}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="agent-react-pop w-[min(220px,calc(100vw-24px))] p-1.5">
        <div role="radiogroup" aria-label={tx('주제')}>
          {ANON_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={value === c.id}
              className="agent-react-opt"
              onClick={() => {
                onChange(c.id)
                setOpen(false)
              }}
            >
              <span className="min-w-0 flex-1 text-left text-[14px] font-semibold text-n-111"><T>{c.label}</T></span>
              {value === c.id && <Check className="w-4 h-4 text-n-111 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
