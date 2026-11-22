'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { msg } from '@/i18n/translate'

function splitUrls(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function optionalUrl(raw: string): string | null {
  const v = raw.trim()
  return v ? v : null
}

export function NewProductClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [screenshotsRaw, setScreenshotsRaw] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [appStoreUrl, setAppStoreUrl] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !tagline.trim() || !description.trim()) {
      toast.error(tn('이름, 한 줄 소개, 설명은 필수입니다.'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tagline: tagline.trim(),
          description: description.trim(),
          logo_url: optionalUrl(logoUrl),
          screenshots: splitUrls(screenshotsRaw),
          website_url: optionalUrl(websiteUrl),
          app_store_url: optionalUrl(appStoreUrl),
          github_url: optionalUrl(githubUrl),
          tags: splitTags(tagsRaw),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('등록에 실패했습니다.'))
        return
      }
      toast.success(tn('프로덕트가 등록되었습니다.'))
      const id = data.product?.id
      if (id) {
        router.push(`/products/${id}`) // → redirects to the launch's tool page
      } else {
        router.push('/tools?category=launch')
      }
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/tools?category=launch"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <T>툴 목록</T>
      </Link>

      <div className="card">
        <div className="p-6 border-b border-[#e5e5e5]">
          <h1 className="text-xl font-bold text-[#111]"><T>프로덕트 런치</T></h1>
          <p className="text-sm text-[#666] mt-1"><T>만든 도구나 서비스를 소개하세요. 툴 목록에 ‘런치’로 올라가고 업보트를 받을 수 있어요.</T></p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Field label={msg('이름')} required>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="MCP Lab Bench"
            />
          </Field>

          <Field label={msg('한 줄 소개')} required>
            <input
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={140}
              placeholder={tx('무엇을 해결하는 프로덕트인지 한 문장으로')}
            />
          </Field>

          <Field label={msg('설명 (마크다운)')} required>
            <textarea
              className="input resize-none min-h-[160px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tx('기능, 사용 대상, 로드맵 등을 적어 주세요.')}
            />
          </Field>

          <Field label={msg('로고 URL')} hint={msg('정사각형 이미지 권장')}>
            <input
              className="input"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </Field>

          <Field label={msg('스크린샷 URL')} hint={msg('쉼표 또는 줄바꿈으로 여러 개')}>
            <textarea
              className="input resize-none min-h-[72px]"
              value={screenshotsRaw}
              onChange={(e) => setScreenshotsRaw(e.target.value)}
              placeholder="https://..., https://..."
            />
          </Field>

          <div className="grid sm:grid-cols-1 gap-5">
            <Field label={msg('웹사이트')}>
              <input
                className="input"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            <Field label="App Store">
              <input
                className="input"
                type="url"
                value={appStoreUrl}
                onChange={(e) => setAppStoreUrl(e.target.value)}
                placeholder="https://apps.apple.com/..."
              />
            </Field>
            <Field label="GitHub">
              <input
                className="input"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/..."
              />
            </Field>
          </div>

          <Field label={msg('태그')} hint={msg('쉼표로 구분, 최대 8개')}>
            <input
              className="input"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder={tx('MCP, 개발도구, 오픈소스')}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#eee]">
            <Link href="/tools?category=launch" className="btn btn-secondary">
              <T>취소</T>
            </Link>
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? <T>등록 중...</T> : <T>등록하기</T>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#333] mb-1.5">
        <T>{label}</T>
        {required && <span className="text-[#888] font-normal"> <T>· 필수</T></span>}
      </label>
      {hint && <p className="text-xs text-[#888] mb-1.5"><T>{hint}</T></p>}
      {children}
    </div>
  )
}
