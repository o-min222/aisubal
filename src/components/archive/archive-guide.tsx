'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { T } from '@/i18n/t'
import { tx, useLocale } from '@/i18n/client'

/**
 * '내 AI로 쓰는 법': header button → modal (bottom sheet on phones).
 * The archive is used from AI only through MCP / CLI; this explains how.
 */
export function ArchiveGuideButton({ hasAgent, exampleRef = 'A12', exampleTag = 'mcp' }: { hasAgent: boolean; exampleRef?: string; exampleTag?: string }) {
  const [open, setOpen] = useState(false)
  const locale = useLocale()
  const say = locale === 'en' ? `Summarize my archive item #${exampleRef}` : `아카이브 항목 #${exampleRef} 참고해서 요약해줘`
  const sayTag = locale === 'en' ? `Use everything tagged #${exampleTag} in my archive` : `아카이브에서 #${exampleTag} 태그 붙은 거 다 참고해줘`
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 flex-shrink-0" onClick={() => setOpen(true)}>
        <Sparkles className="w-4 h-4" /> <T>내 AI로 쓰는 법</T>
      </button>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={tx('내 AI로 쓰는 법')} className="archive-guide sm:!max-w-lg">
        <div className="archive-guide-body">
          {!hasAgent && (
            <p className="archive-guide-note">
              <T s="아직 연결된 에이전트가 없어요. {link}에서 ‘아카이브’ 권한으로 연결해 주세요." vars={{ link: <Link href="/connect"><T>내 에이전트</T></Link> }} />
            </p>
          )}
          <p className="archive-guide-label"><T>번호와 태그</T></p>
          <p className="text-[13px] text-[#555]">
            <T>항목마다 붙은 번호(#A12)나 태그(#태그명)로 내 AI에게 말하면, 연결된 에이전트가 MCP·CLI로 아카이브를 가져와요.</T>
          </p>
          <p className="archive-guide-label"><T>AI에게 이렇게 말해요</T></p>
          <ul className="archive-guide-list">
            <li><code className="say">{say}</code></li>
            <li><code className="say">{sayTag}</code></li>
          </ul>
          <p className="archive-guide-label"><T>터미널 (CLI)</T></p>
          <ul className="archive-guide-list">
            <li><code>aisubal archive get {exampleRef}</code></li>
            <li><code>aisubal archive search {locale === 'en' ? 'prompt' : '프롬프트'} --tag {exampleTag}</code></li>
            <li><code>aisubal archive add https://… --tag {exampleTag}</code></li>
          </ul>
          <p className="archive-guide-label"><T>MCP 도구</T></p>
          <p className="text-[12.5px] text-[#666]">
            <code>archive_list</code> · <code>archive_search</code> · <code>archive_get</code> · <code>archive_add</code>{' '}
            <span className="text-[#999]"><T>(읽기 archive:read · 저장 archive:write)</T></span>
          </p>
          <p className="text-[12.5px] text-[#777]"><T>링크는 에이전트가 archive_add로 담을 수 있어요.</T></p>
          <p className="text-[13px] mt-1">
            <Link href="/connect" className="underline underline-offset-2 text-[#333]"><T>내 에이전트에서 연결·설정하기</T></Link>
          </p>
        </div>
      </AdaptiveSheet>
    </>
  )
}
