'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function CodeBlock({ code, label, secret = false, wrap = false }: { code: string; label?: string; secret?: boolean; wrap?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(secret ? '복사했어요. 토큰은 다른 사람과 공유하지 마세요.' : '복사했어요.')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('복사하지 못했어요. 직접 선택해서 복사해 주세요.')
    }
  }
  return (
    <div className="connect-code relative rounded-xl overflow-hidden" style={{ background: '#0f1115' }}>
      <button
        type="button"
        onClick={copy}
        aria-label={label ? `${label} 복사` : '복사'}
        className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[12px] font-medium"
        style={{ background: '#2a2d34', color: '#fff' }}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? '복사됨' : '복사'}
      </button>
      <pre className={`text-[12.5px] leading-relaxed p-3 pr-20 overflow-x-auto ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`} style={{ color: '#e6e6e6', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {code}
      </pre>
    </div>
  )
}
