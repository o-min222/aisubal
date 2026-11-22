'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Link2, Loader2, Bot, Terminal, FileCode, MessageSquare, FileText } from 'lucide-react'
import type { AssetType, Member, LinkPreview, PostAs } from '@/lib/supabase/types'
import { LinkCard } from '@/components/link-card'
import { UserAvatar } from '@/components/user-avatar'
import { memberHasNicknameProfile } from '@/lib/profile'
import { toast } from 'sonner'

interface NewPostClientProps {
  member: Member
  nicknameUnlocked: boolean
  activeMemberCount: number
  unlockThreshold: number
}

interface AssetDraft {
  id: string
  type: AssetType
  name: string
  content: string
}

const ASSET_TYPES = [
  { value: 'SKILL_MD' as const, label: 'Agent Skill', icon: Bot },
  { value: 'MCP_CONFIG' as const, label: 'MCP 설정', icon: Terminal },
  { value: 'CURSOR_RULES' as const, label: 'Cursor 규칙', icon: FileCode },
  { value: 'PROMPT' as const, label: '프롬프트', icon: MessageSquare },
  { value: 'NOTE' as const, label: '노트', icon: FileText },
]

export function NewPostClient({
  member,
  nicknameUnlocked,
  activeMemberCount,
  unlockThreshold,
}: NewPostClientProps) {
  const router = useRouter()
  const hasNick = memberHasNicknameProfile(member)
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  const [urlInput, setUrlInput] = useState('')
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [fetching, setFetching] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [assets, setAssets] = useState<AssetDraft[]>([])
  const [loading, setLoading] = useState(false)

  async function fetchPreview() {
    if (!urlInput.trim()) return
    setFetching(true)
    try {
      const res = await fetch('/api/og-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '미리보기를 가져오지 못했습니다.')
        return
      }
      setPreview(data.preview)
      if (!title && data.preview.title) setTitle(data.preview.title)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setFetching(false)
    }
  }

  function addAsset() {
    setAssets([
      ...assets,
      { id: crypto.randomUUID(), type: 'PROMPT', name: '', content: '' },
    ])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) {
      toast.error('코멘트를 입력해 주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || preview?.title || '제목 없음',
          content,
          url: preview?.url || urlInput || undefined,
          linkPreview: preview || undefined,
          postedAs,
          assets,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '게시 실패')
        return
      }
      toast.success('게시되었습니다.')
      router.push('/feed')
    } catch {
      toast.error('게시 중 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/posts/new" className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-4">
        <ArrowLeft className="w-4 h-4" />
        짧은 글로 돌아가기
      </Link>

      <div className="card">
        <div className="p-6 border-b border-[#e5e5e5]">
          <h1 className="text-xl font-bold text-[#111]">새 게시물</h1>
          <p className="text-sm text-[#666] mt-1">링크를 붙이고 코멘트를 남기세요. AI 에셋은 선택입니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Profile switcher */}
          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">게시 프로필</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPostedAs('real')}
                className={`profile-switch ${postedAs === 'real' ? 'active' : ''}`}
              >
                <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} size="sm" />
                <span>{member.display_name}</span>
                <span className="text-xs text-[#888]">실명</span>
              </button>
              {nicknameUnlocked && hasNick ? (
                <button
                  type="button"
                  onClick={() => setPostedAs('nickname')}
                  className={`profile-switch ${postedAs === 'nickname' ? 'active' : ''}`}
                >
                  <UserAvatar
                    id={`nick_${member.id}`}
                    name={member.nickname!}
                    avatarUrl={member.nickname_avatar_url}
                    size="sm"
                  />
                  <span>{member.nickname}</span>
                  <span className="text-xs text-[#888]">별명</span>
                </button>
              ) : (
                <div className="profile-switch opacity-60 cursor-not-allowed" title="별명 프로필 잠김">
                  <span className="text-sm text-[#888]">
                    {nicknameUnlocked
                      ? '설정에서 별명 프로필을 만드세요'
                      : `별명 잠김 · 멤버 ${unlockThreshold}명부터 (현재 ${activeMemberCount})`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* URL first */}
          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">
              <Link2 className="w-4 h-4 inline mr-1" />
              공유 링크
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="input flex-1"
                placeholder="https://… (기사, YouTube, GitHub, X)"
              />
              <button
                type="button"
                onClick={fetchPreview}
                disabled={fetching || !urlInput.trim()}
                className="btn btn-secondary"
              >
                {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : '미리보기'}
              </button>
            </div>
            {preview && (
              <div className="mt-3">
                <LinkCard link={preview} />
                <button
                  type="button"
                  className="text-xs text-[#888] mt-2 hover:text-[#111]"
                  onClick={() => {
                    setPreview(null)
                    setUrlInput('')
                  }}
                >
                  링크 제거
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="한눈에 알 수 있는 제목"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#333] mb-2">
              코멘트 <span className="text-red-500">*</span>
            </label>
            <textarea
              maxLength={500}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={6}
              className="input resize-none"
              placeholder="이 링크에 대한 생각, 팁, 맥락을 적어 주세요. 마크다운 지원."
            />
          </div>

          {/* Optional assets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-medium text-[#333]">AI 에셋 (선택)</label>
                <p className="text-xs text-[#888]">SKILL / MCP / RULES / 프롬프트 첨부</p>
              </div>
              <button type="button" onClick={addAsset} className="btn btn-secondary btn-sm">
                <Plus className="w-4 h-4" />
                추가
              </button>
            </div>
            {assets.map((asset) => (
              <div key={asset.id} className="border border-[#e5e5e5] rounded-lg bg-[#fafafa] mb-3 p-4 space-y-3">
                <div className="flex gap-3">
                  <select
                    value={asset.type}
                    onChange={(e) =>
                      setAssets(assets.map((a) =>
                        a.id === asset.id ? { ...a, type: e.target.value as AssetType } : a
                      ))
                    }
                    className="input text-sm"
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    className="input text-sm flex-1"
                    placeholder="에셋 이름"
                    value={asset.name}
                    onChange={(e) =>
                      setAssets(assets.map((a) =>
                        a.id === asset.id ? { ...a, name: e.target.value } : a
                      ))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setAssets(assets.filter((a) => a.id !== asset.id))}
                    className="p-2 text-[#888] hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  className="input font-mono text-sm resize-none"
                  rows={5}
                  placeholder="내용"
                  value={asset.content}
                  onChange={(e) =>
                    setAssets(assets.map((a) =>
                      a.id === asset.id ? { ...a, content: e.target.value } : a
                    ))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#eee]">
            <Link href="/feed" className="btn btn-secondary">취소</Link>
            <button type="submit" disabled={loading || !content.trim()} className="btn btn-primary disabled:opacity-50">
              {loading ? '게시 중...' : '게시하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
