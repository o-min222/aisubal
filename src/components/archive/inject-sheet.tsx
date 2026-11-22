'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, Link2, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { T } from '@/i18n/t'
import { tn, tx, useLocale } from '@/i18n/client'
import { bundleFileName, bundlePrompt } from '@/lib/archive-rules'
import { BUNDLE_PROMPT_EN } from '@/lib/archive-bundle-i18n'
import { BUNDLE_PROMPT_KO } from '@/lib/archive-rules'

/**
 * '내 AI에 넣기': a compact Markdown bundle for one item or a selection.
 * Copy as a ready prompt, download .md, or make a stable link any AI can fetch.
 */
export function InjectSheet({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const locale = useLocale()
  const [md, setMd] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ count: number; anonCount: number } | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState<'link' | null>(null)
  const [copied, setCopied] = useState<'prompt' | 'link' | null>(null)
  const key = ids?.join(',') ?? ''

  useEffect(() => {
    if (!key) return
    let live = true
    setMd(null)
    setLink(null)
    fetch('/api/archive/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: key.split(',') }) })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        if (live) {
          setMd(d.markdown)
          setMeta({ count: d.count, anonCount: d.anonCount })
        }
      })
      .catch((e) => {
        toast.error(e instanceof Error && e.message ? e.message : tn('네트워크 오류'))
        onClose()
      })
    return () => {
      live = false
    }
  }, [key, onClose])

  async function copy(text: string, what: 'prompt' | 'link') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      toast.success(what === 'prompt' ? tn('프롬프트를 복사했어요. AI 채팅에 붙여 넣으세요.') : tn('링크를 복사했어요'))
      setTimeout(() => setCopied(null), 1600)
    } catch {
      toast.error(tn('복사하지 못했어요'))
    }
  }

  function download() {
    if (!md) return
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: bundleFileName() })
    a.click()
    URL.revokeObjectURL(url)
  }

  async function makeLink() {
    setBusy('link')
    try {
      const r = await fetch('/api/archive/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: key.split(','), link: true }) })
      const d = await r.json()
      if (!r.ok || !d.link) throw new Error(d.error || tn('링크를 만들 수 없어요 (익명 글만 선택됨).'))
      const l = locale === 'en' ? `${d.link}?lang=en` : d.link
      setLink(l)
      void copy(l, 'link')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('네트워크 오류'))
    } finally {
      setBusy(null)
    }
  }

  const lead = locale === 'en' ? BUNDLE_PROMPT_EN : BUNDLE_PROMPT_KO
  return (
    <AdaptiveSheet open={!!ids} onOpenChange={(o) => !o && onClose()} title={tx('내 AI에 넣기')} className="sm:max-w-lg">
      {!md ? (
        <div className="flex items-center justify-center py-10 text-[#999]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 min-w-0">
          <p className="text-[13px] text-[#666]">
            <T s="자료 {n}개를 AI가 읽기 좋은 마크다운으로 묶었어요." vars={{ n: meta?.count ?? 0 }} />
          </p>
          <div className="inject-preview" tabIndex={0} aria-label={tx('미리보기')}>
            <pre>{md}</pre>
          </div>
          <p className="flex items-start gap-1.5 text-[12px] text-[#888]">
            <ShieldAlert className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
            <span><T>다른 사람이 쓴 내용은 ‘신뢰할 수 없는 제3자 콘텐츠’로 표시돼서, AI가 그 안의 지시를 따르지 않아요.</T></span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" className="btn btn-primary btn-sm inline-flex items-center justify-center gap-1.5" onClick={() => void copy(bundlePrompt(md, lead), 'prompt')}>
              {copied === 'prompt' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} <T>프롬프트 복사</T>
            </button>
            <button type="button" className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5" onClick={download}>
              <Download className="w-4 h-4" /> <T>.md 다운로드</T>
            </button>
            <button type="button" className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5" onClick={() => void (link ? copy(link, 'link') : makeLink())} disabled={busy === 'link'}>
              {busy === 'link' ? <Loader2 className="w-4 h-4 animate-spin" /> : copied === 'link' ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />} {link ? <T>링크 복사</T> : <T>링크 만들기</T>}
            </button>
          </div>
          {link && <p className="text-[12px] text-[#666] break-all font-mono">{link}</p>}
          <p className="text-[11.5px] text-[#999]">
            <T>링크는 이 묶음 전용이고 추측할 수 없는 주소예요. 링크를 가진 사람은 누구나 볼 수 있어요.</T>
            {meta && meta.anonCount > 0 && <> <T s="익명 게시판 글 {n}개는 링크에 포함되지 않아요." vars={{ n: meta.anonCount }} /></>}
          </p>
        </div>
      )}
    </AdaptiveSheet>
  )
}
