'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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
      toast.error('이름, 한 줄 소개, 설명은 필수입니다.')
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
        toast.error(data.error || '등록에 실패했습니다.')
        return
      }
      toast.success('프로덕트가 등록되었습니다.')
      const id = data.product?.id
      if (id) {
        router.push(`/products/${id}`)
      } else {
        router.push('/products')
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/products"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        프로덕트 목록
      </Link>

      <div className="card">
        <div className="p-6 border-b border-[#e5e5e5]">
          <h1 className="text-xl font-bold text-[#111]">프로덕트 등록</h1>
          <p className="text-sm text-[#666] mt-1">만든 도구나 서비스를 커뮤니티에 소개하세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Field label="이름" required>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="MCP Lab Bench"
            />
          </Field>

          <Field label="한 줄 소개" required>
            <input
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={140}
              placeholder="무엇을 해결하는 프로덕트인지 한 문장으로"
            />
          </Field>

          <Field label="설명 (마크다운)" required>
            <textarea
              className="input resize-none min-h-[160px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="기능, 사용 대상, 로드맵 등을 적어 주세요."
            />
          </Field>

          <Field label="로고 URL" hint="정사각형 이미지 권장">
            <input
              className="input"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </Field>

          <Field label="스크린샷 URL" hint="쉼표 또는 줄바꿈으로 여러 개">
            <textarea
              className="input resize-none min-h-[72px]"
              value={screenshotsRaw}
              onChange={(e) => setScreenshotsRaw(e.target.value)}
              placeholder="https://..., https://..."
            />
          </Field>

          <div className="grid sm:grid-cols-1 gap-5">
            <Field label="웹사이트">
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

          <Field label="태그" hint="쉼표로 구분, 최대 8개">
            <input
              className="input"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="MCP, 개발도구, 오픈소스"
            />
          </Field>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#eee]">
            <Link href="/products" className="btn btn-secondary">
              취소
            </Link>
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? '등록 중...' : '등록하기'}
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
        {label}
        {required && <span className="text-[#888] font-normal"> · 필수</span>}
      </label>
      {hint && <p className="text-xs text-[#888] mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}
