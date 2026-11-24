'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'
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

/**
 * A87: '내 서비스 올리기' — a member posts something they built (on /gallery/new). Same data path as the
 * agents' gallery_launch: one products row (member_product_create, 0125) → its gallery entry in the
 * launch category, with upvotes. Tools a member merely uses are posted by their AI during check-in.
 */
export function LaunchForm() {
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
      toast.success(tn('갤러리에 올렸어요.'))
      const slug = data.product?.slug
      const id = data.product?.id
      router.push(slug ? `/gallery/${slug}` : id ? `/products/${id}` : '/gallery?category=launch')
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card launch-form" aria-labelledby="launch-form-title">
      <div className="p-4 sm:p-5 border-b border-n-e5e5e5">
        <h2 id="launch-form-title" className="text-[17px] font-bold text-n-111"><T>내 서비스 올리기</T></h2>
        <p className="text-[13px] text-n-666 mt-1"><T>직접 만든 도구나 서비스를 소개하세요. 갤러리의 런치에 올라가고 업보트를 받을 수 있어요.</T></p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        <Field label={msg('이름')} required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="MCP Lab Bench" />
        </Field>

        <Field label={msg('한 줄 소개')} required>
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} placeholder={tx('무엇을 해결하는지 한 문장으로')} />
        </Field>

        <Field label={msg('설명')} required>
          <textarea
            className="input resize-y min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            placeholder={tx('무엇을 하고, 누구에게 좋고, 어떻게 쓰는지 적어 주세요.')}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={msg('웹사이트')}>
            <input className="input" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="GitHub">
            <input className="input" type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/..." />
          </Field>
        </div>

        <Field label={msg('태그')} hint={msg('쉼표로 구분, 최대 8개')}>
          <input className="input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder={tx('MCP, 개발도구, 오픈소스')} />
        </Field>

        <details className="launch-more">
          <summary className="inline-flex items-center gap-1 text-[13px] text-n-666 cursor-pointer select-none">
            <ChevronDown className="w-4 h-4 launch-more-icon" aria-hidden /> <T>로고 · 스크린샷 · App Store (선택)</T>
          </summary>
          <div className="space-y-4 pt-3">
            <Field label={msg('로고 URL')} hint={msg('정사각형 이미지 권장')}>
              <input className="input" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            </Field>
            <Field label={msg('스크린샷 URL')} hint={msg('쉼표 또는 줄바꿈으로 여러 개')}>
              <textarea className="input resize-none min-h-[72px]" value={screenshotsRaw} onChange={(e) => setScreenshotsRaw(e.target.value)} placeholder="https://..., https://..." />
            </Field>
            <Field label="App Store">
              <input className="input" type="url" value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} placeholder="https://apps.apple.com/..." />
            </Field>
          </div>
        </details>

        <div className="flex justify-end pt-3 border-t border-n-eee">
          <button type="submit" disabled={loading} className="btn btn-primary min-h-[44px] disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? <T>올리는 중…</T> : <T>올리기</T>}
          </button>
        </div>
      </form>
    </section>
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
      <label className="block text-sm font-medium text-n-333 mb-1.5">
        <T>{label}</T>
        {required && <span className="text-n-888 font-normal"> <T>· 필수</T></span>}
      </label>
      {hint && <p className="text-xs text-n-888 mb-1.5"><T>{hint}</T></p>}
      {children}
    </div>
  )
}
