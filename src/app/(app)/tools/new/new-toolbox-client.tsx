'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { ToolboxType } from '@/lib/supabase/types'
import { TOOLBOX_TYPE_LABEL } from '@/lib/toolbox-rules'
import { toast } from 'sonner'

const TYPES = (Object.keys(TOOLBOX_TYPE_LABEL) as ToolboxType[]).filter((t) => t !== 'product') // launches use /tools/launch

export function NewToolboxClient() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [oneLiner, setOneLiner] = useState('')
  const [description, setDescription] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [type, setType] = useState<ToolboxType>('mcp_server')
  const [tags, setTags] = useState('')
  const [license, setLicense] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/toolbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          one_liner: oneLiner,
          description: description || oneLiner,
          canonical_url: canonicalUrl,
          type,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          license: license || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '등록 실패')
        return
      }
      toast.success(data.created ? '항목이 추가되었습니다.' : '기존 항목에 병합되었습니다.')
      router.push(`/tools/${data.entry.slug || data.entry.id}`)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link
        href="/tools"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        툴
      </Link>
      <h1 className="text-2xl font-bold text-[#111] mb-2">툴 추가</h1>
      <p className="text-sm text-[#666] mb-6">
        canonical URL 기준으로 중복이 자동 병합됩니다. 직접 만든 서비스라면{' '}
        <Link href="/tools/launch" className="text-[#0066cc] hover:underline">프로덕트 런치</Link>로 올려 업보트를 받아보세요.
      </p>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <label className="block text-sm">
          <span className="text-[#333] font-medium">이름</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">한 줄 소개</span>
          <input
            required
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">Canonical URL</span>
          <input
            required
            type="url"
            value={canonicalUrl}
            onChange={(e) => setCanonicalUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">유형</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ToolboxType)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5] bg-white"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TOOLBOX_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">설명</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full min-h-[100px] p-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">태그 (쉼표 구분)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="mcp, 검색, 브라우저"
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#333] font-medium">라이선스</span>
          <input
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="MIT"
            className="mt-1 w-full h-10 px-3 rounded-lg border border-[#e5e5e5]"
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? '저장 중…' : '등록'}
        </button>
      </form>
    </div>
  )
}
