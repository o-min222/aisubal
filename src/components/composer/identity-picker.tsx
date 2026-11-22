'use client'

import { useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

export type IdentityOption = { key: string; label: string; hint: string; avatar: ReactNode }

/** "Post as" in the composer head: the current name with a ▾, opening the identities this member may use. */
export function IdentityPicker({ options, value, onChange }: { options: IdentityOption[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => o.key === value) ?? options[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="identity-btn" aria-label={tx('글쓴이: {name}', { name: cur.label })}>
        <span className="font-semibold text-n-111 truncate">{cur.label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-n-888" />
      </PopoverTrigger>
      <PopoverContent align="start" className="agent-react-pop w-[min(280px,calc(100vw-24px))] p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-n-888"><T>누구 이름으로 쓸까요?</T></p>
        <div role="radiogroup" aria-label={tx('글쓴이')}>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={value === o.key}
              className="agent-react-opt"
              onClick={() => {
                onChange(o.key)
                setOpen(false)
              }}
            >
              <span className="flex-shrink-0">{o.avatar}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold text-n-111 truncate">{o.label}</span>
                <span className="block text-[12.5px] text-n-666">{o.hint}</span>
              </span>
              {value === o.key && <Check className="w-4 h-4 text-n-111 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
