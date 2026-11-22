'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bot, Terminal, FileCode, MessageSquare, FileText, ChevronUp, TrendingUp, Tag, Link2, CalendarDays, Rocket, Wrench, Star } from 'lucide-react'
import type { Member, ToolboxEntry } from '@/lib/supabase/types'
import type {
  PostWithDetails,
  MeetupWithDetails,
  ProductWithDetails,
} from '@/lib/data/types'
import { TOOLBOX_TYPE_LABEL } from '@/lib/toolbox-rules'
import { RelativeTime } from '@/components/relative-time'
import { UserAvatar, AuthorAvatar } from '@/components/user-avatar'
import { LinkCard } from '@/components/link-card'
import { excerptFromMarkdown } from '@/lib/markdown'
import { publicAuthorLabel } from '@/lib/profile'

interface FeedClientProps {
  member: Member
  posts: PostWithDetails[]
  trending: PostWithDetails[]
  meetups: MeetupWithDetails[]
  products: ProductWithDetails[]
  tools: ToolboxEntry[]
}

const ASSET_TYPE_INFO: Record<string, { label: string; Icon: typeof Bot; badgeClass: string }> = {
  SKILL_MD: { label: 'SKILL', Icon: Bot, badgeClass: 'badge-skill' },
  MCP_CONFIG: { label: 'MCP', Icon: Terminal, badgeClass: 'badge-mcp' },
  CURSOR_RULES: { label: 'RULES', Icon: FileCode, badgeClass: 'badge-rules' },
  PROMPT: { label: 'PROMPT', Icon: MessageSquare, badgeClass: 'badge-prompt' },
  NOTE: { label: 'NOTE', Icon: FileText, badgeClass: 'badge-note' },
}

export function FeedClient({
  member,
  posts,
  trending,
  meetups,
  products,
  tools,
}: FeedClientProps) {
  const [activeTab, setActiveTab] = useState<'popular' | 'recent'>('popular')

  const sortedPosts = [...posts].sort((a, b) => {
    if (activeTab === 'popular') return b.archive_count - a.archive_count
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="layout-grid">
      <aside className="hidden lg:block">
        <div className="left-nav">
          <Link href="/feed" className="left-nav-item active">
            <Link2 className="w-4 h-4" />
            전체
          </Link>
          {Object.entries(ASSET_TYPE_INFO).map(([type, info]) => (
            <Link key={type} href={`/feed?type=${type}`} className="left-nav-item">
              <info.Icon className="w-4 h-4" />
              {info.label}
            </Link>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <Link href="/posts/new" className="composer group">
          <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} />
          <span className="composer-input text-[#888] group-hover:text-[#666]">
            링크를 공유하거나 코멘트를 남겨보세요
          </span>
          <span className="btn btn-primary btn-sm">글쓰기</span>
        </Link>

        <div className="tab-filters">
          <button
            onClick={() => setActiveTab('popular')}
            className={`tab-filter ${activeTab === 'popular' ? 'active' : ''}`}
          >
            인기
          </button>
          <button
            onClick={() => setActiveTab('recent')}
            className={`tab-filter ${activeTab === 'recent' ? 'active' : ''}`}
          >
            최신
          </button>
        </div>

        <div className="space-y-3">
          {sortedPosts.map((post) => (
            <FeedItem key={post.id} post={post} />
          ))}
        </div>
      </div>

      <aside className="hidden lg:block space-y-4">
        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            툴박스 추천
          </h3>
          <div>
            {tools.map((t, i) => (
              <Link key={t.id} href={`/toolbox/${t.slug}`} className="trending-item group">
                <span className="trending-item-rank">{i + 1}</span>
                <div className="trending-item-content">
                  <span className="trending-item-title group-hover:text-[#0066cc]">
                    {t.name}
                  </span>
                  <span className="trending-item-meta inline-flex items-center gap-1">
                    {TOOLBOX_TYPE_LABEL[t.type]} ·
                    <Star className="w-3 h-3 fill-[#f5a623] text-[#f5a623]" />
                    {t.avg_rating.toFixed(1)} · 언급 {t.mention_count}
                  </span>
                </div>
              </Link>
            ))}
            <Link href="/toolbox" className="block text-xs text-[#0066cc] mt-2 px-1">
              스킬·서비스 디렉터리
            </Link>
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            다가오는 모임
          </h3>
          <div>
            {meetups.length === 0 ? (
              <p className="text-sm text-[#888] px-1 py-2">예정된 모임이 없습니다.</p>
            ) : (
              meetups.map((m) => (
                <Link key={m.id} href={`/meetups/${m.id}`} className="trending-item group">
                  <span className="trending-item-rank">
                    {m.mode === 'online' ? '온' : '오프'}
                  </span>
                  <div className="trending-item-content">
                    <span className="trending-item-title group-hover:text-[#0066cc]">
                      {m.title}
                    </span>
                    <span className="trending-item-meta">
                      {new Date(m.starts_at).toLocaleString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {m.confirmed_count}/{m.capacity}명
                    </span>
                  </div>
                </Link>
              ))
            )}
            <Link href="/meetups" className="block text-xs text-[#0066cc] mt-2 px-1">
              모든 모임 보기
            </Link>
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            추천 프로덕트
          </h3>
          <div>
            {products.map((p, i) => (
              <Link key={p.id} href={`/products/${p.id}`} className="trending-item group">
                <span className="trending-item-rank">{i + 1}</span>
                <div className="trending-item-content">
                  <span className="trending-item-title group-hover:text-[#0066cc]">
                    {p.name}
                  </span>
                  <span className="trending-item-meta">
                    {p.upvote_count} 업보트 · {p.tagline}
                  </span>
                </div>
              </Link>
            ))}
            <Link href="/products" className="block text-xs text-[#0066cc] mt-2 px-1">
              프로덕트 랭킹
            </Link>
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            인기 에셋
          </h3>
          <div>
            {trending.map((post, i) => (
              <Link key={post.id} href={`/posts/${post.id}`} className="trending-item group">
                <span className="trending-item-rank">{i + 1}</span>
                <div className="trending-item-content">
                  <span className="trending-item-title group-hover:text-[#0066cc]">
                    {post.title}
                  </span>
                  <span className="trending-item-meta">{post.archive_count}명이 저장</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Tag className="w-4 h-4" />
            에셋 타입
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ASSET_TYPE_INFO).map(([type, info]) => (
              <span key={type} className={`badge ${info.badgeClass}`}>
                {info.label}
              </span>
            ))}
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title">커뮤니티</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888]">총 게시물</span>
              <span className="font-medium text-[#111]">{posts.length}개</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">활성 멤버</span>
              <span className="font-medium text-[#111]">3명</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function FeedItem({ post }: { post: PostWithDetails }) {
  const primaryAsset = post.assets[0]
  const typeInfo = primaryAsset ? ASSET_TYPE_INFO[primaryAsset.type] : null
  const authorName = publicAuthorLabel(post.author)

  return (
    <article className="feed-item">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1 flex-wrap">
            {post.posted_as === 'nickname' && (
              <span className="badge badge-agent">별명</span>
            )}
            {typeInfo && (
              <span className={`badge ${typeInfo.badgeClass}`}>{typeInfo.label}</span>
            )}
            {post.is_agent_posted && (
              <span className="badge badge-agent">
                <Bot className="w-3 h-3 mr-1" />
                Agent
              </span>
            )}
          </div>

          <Link href={`/posts/${post.id}`}>
            <h3 className="feed-item-title">{post.title}</h3>
          </Link>

          <p className="feed-item-desc line-clamp-2 mb-3">
            {excerptFromMarkdown(post.content)}
          </p>

          {post.url && (
            <div className="mb-3">
              <LinkCard
                compact
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
          )}

          <div className="feed-item-meta">
            <div className="flex items-center gap-2">
              <AuthorAvatar author={post.author} size="sm" />
              <span>{authorName}</span>
            </div>
            <span>·</span>
            <RelativeTime date={post.created_at} />
          </div>
        </div>

        <div className="flex-shrink-0">
          <button className="upvote-btn">
            <ChevronUp />
            <span>{post.archive_count}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
