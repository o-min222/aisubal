'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Copy, Download, Bot, Terminal, FileCode, MessageSquare, FileText } from 'lucide-react'
import type { Member, Asset } from '@/lib/supabase/types'
import type { PostWithDetails } from '@/lib/data/types'
import { RelativeTime } from '@/components/relative-time'
import { AuthorAvatar } from '@/components/user-avatar'
import { MarkdownBody } from '@/components/markdown-body'
import { LinkCard } from '@/components/link-card'
import { ArchiveButton } from '@/components/archive/archive-button'
import { publicAuthorLabel } from '@/lib/profile'
import { youtubeEmbedUrl } from '@/lib/link-preview'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { msg } from '@/i18n/translate'

interface PostDetailClientProps {
  post: PostWithDetails
  member: Member
}

const ASSET_TYPE_INFO: Record<string, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  SKILL_MD: { label: 'Agent Skill', icon: <Bot className="w-4 h-4" />, badgeClass: 'badge-skill' },
  MCP_CONFIG: { label: msg('MCP 설정'), icon: <Terminal className="w-4 h-4" />, badgeClass: 'badge-mcp' },
  CURSOR_RULES: { label: msg('Cursor 규칙'), icon: <FileCode className="w-4 h-4" />, badgeClass: 'badge-rules' },
  PROMPT: { label: msg('프롬프트'), icon: <MessageSquare className="w-4 h-4" />, badgeClass: 'badge-prompt' },
  NOTE: { label: msg('노트'), icon: <FileText className="w-4 h-4" />, badgeClass: 'badge-note' },
}

export function PostDetailClient({ post }: PostDetailClientProps) {
  const [activeAssetId, setActiveAssetId] = useState(post.assets[0]?.id)
  const activeAsset = post.assets.find((a) => a.id === activeAssetId)
  const authorName = publicAuthorLabel(post.author)
  const embed = post.url && post.link_type === 'youtube' ? youtubeEmbedUrl(post.url) : null

  return (
    <div>

      <article className="card p-4 md:p-6 mb-3">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {post.posted_as === 'nickname' && <span className="badge badge-agent"><T>별명</T></span>}
              {post.assets[0] && (
                <span className={`badge ${ASSET_TYPE_INFO[post.assets[0].type]?.badgeClass}`}>
                  {ASSET_TYPE_INFO[post.assets[0].type]?.label}
                </span>
              )}
              {post.is_agent_posted && (
                <span className="badge badge-agent">
                  <Bot className="w-3 h-3 mr-1" />
                  Agent
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-[#111] mb-4">{post.title}</h1>

            <div className="flex items-center gap-3 text-sm text-[#666]">
              <div className="flex items-center gap-2">
                <AuthorAvatar author={post.author} />
                <span className="font-medium text-[#333]">{authorName}</span>
              </div>
              <span>·</span>
              <span title={format(new Date(post.created_at), tx('yyyy년 M월 d일 HH:mm'), { locale: ko })}>
                <RelativeTime date={post.created_at} />
              </span>
              <span>·</span>
              <span><T s="{archive_count}명이 저장" vars={{ archive_count: post.archive_count }} /></span>
            </div>
          </div>

          <ArchiveButton kind="post" refId={post.id} variant="pill" hint={{ title: post.title ?? undefined, excerpt: post.content?.slice(0, 600) }} />
        </div>

        <MarkdownBody content={post.content} />

        {post.url && (
          <div className="mt-6">
            {embed ? (
              <div className="space-y-3">
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    src={embed}
                    title={post.link_title || post.title}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <LinkCard
                  link={{
                    url: post.url,
                    title: post.link_title,
                    description: post.link_description,
                    image: post.link_image,
                    site_name: post.link_site_name,
                    favicon: post.link_favicon,
                    link_type: post.link_type,
                  }}
                />
              </div>
            ) : (
              <LinkCard
                link={{
                  url: post.url,
                  title: post.link_title,
                  description: post.link_description,
                  image: post.link_image,
                  site_name: post.link_site_name,
                  favicon: post.link_favicon,
                  link_type: post.link_type,
                }}
              />
            )}
          </div>
        )}
      </article>

      {post.assets.length > 0 && (
        <div className="card">
          <div className="border-b border-[#e5e5e5] px-4">
            <div className="flex gap-1 -mb-px overflow-x-auto">
              {post.assets.map((asset) => {
                const info = ASSET_TYPE_INFO[asset.type]
                const isActive = asset.id === activeAssetId
                return (
                  <button
                    key={asset.id}
                    onClick={() => setActiveAssetId(asset.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                      isActive ? 'border-[#111] text-[#111]' : 'border-transparent text-[#666]'
                    }`}
                  >
                    {info?.icon}
                    {asset.name}
                  </button>
                )
              })}
            </div>
          </div>

          {activeAsset && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <span className={`badge ${ASSET_TYPE_INFO[activeAsset.type]?.badgeClass}`}>
                  {ASSET_TYPE_INFO[activeAsset.type]?.label}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeAsset.content)
                      toast.success(tn('복사됨'))
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Copy className="w-4 h-4" />
                    <T>복사</T>
                  </button>
                  <button
                    onClick={() => downloadAsset(activeAsset)}
                    className="btn btn-secondary btn-sm"
                  >
                    <Download className="w-4 h-4" />
                    <T>다운로드</T>
                  </button>
                </div>
              </div>
              <pre className="code-block max-h-96 overflow-auto">{activeAsset.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function downloadAsset(asset: Asset) {
  const blob = new Blob([asset.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = asset.filename || asset.name
  a.click()
  URL.revokeObjectURL(url)
}
