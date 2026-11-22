'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, Users, FileText, Flag, ChevronRight, ChevronDown, User, Ban, Trash2, VenetianMask } from 'lucide-react'
import type { Member } from '@/lib/supabase/types'
import { RelativeTime } from '@/components/relative-time'
import { toast } from 'sonner'

interface AdminClientProps {
  member: Member
}

// Mock invite tree data (Lobsters style)
interface InviteNode {
  id: string
  display_name: string
  email: string
  joined_at: string
  is_banned: boolean
  invited_count: number
  children: InviteNode[]
}

const MOCK_INVITE_TREE: InviteNode = {
  id: 'founder',
  display_name: '김민수',
  email: 'kim.real@example.com',
  joined_at: '2026-10-21T00:00:00.000Z',
  is_banned: false,
  invited_count: 2,
  children: [
    {
      id: 'user-1',
      display_name: '김민수',
      email: 'lee.real@example.com',
      joined_at: '2026-10-31T00:00:00.000Z',
      is_banned: false,
      invited_count: 1,
      children: [
        {
          id: 'user-3',
          display_name: '박AI',
          email: 'park@example.com',
          joined_at: '2026-11-16T00:00:00.000Z',
          is_banned: false,
          invited_count: 0,
          children: [],
        },
      ],
    },
    {
      id: 'user-2',
      display_name: '이프론트',
      email: 'park.real@example.com',
      joined_at: '2026-11-06T00:00:00.000Z',
      is_banned: false,
      invited_count: 0,
      children: [],
    },
  ],
}

// Mock reports
const MOCK_REPORTS = [
  {
    id: 'report-1',
    post_title: '효과적인 코드 리뷰 프롬프트',
    reporter: '김개발',
    reason: '중복 게시물',
    created_at: '2026-11-19T00:00:00.000Z',
  },
]

type TabType = 'tree' | 'users' | 'posts' | 'reports'

export function AdminClient({ member }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('tree')

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111] flex items-center gap-2">
          <Shield className="w-6 h-6" />
          관리자 대시보드
        </h1>
        <p className="text-sm text-[#666] mt-1">커뮤니티 관리 및 모니터링</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-2xl font-bold text-[#111]">4</div>
          <div className="text-sm text-[#666]">전체 멤버</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-[#111]">1</div>
          <div className="text-sm text-[#666]">웨이트리스트</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-[#111]">5</div>
          <div className="text-sm text-[#666]">전체 게시물</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-[#111]">1</div>
          <div className="text-sm text-[#666]">신고 대기</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-filters mb-4">
        <button
          onClick={() => setActiveTab('tree')}
          className={`tab-filter ${activeTab === 'tree' ? 'active' : ''}`}
        >
          <Users className="w-4 h-4" />
          초대 트리
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`tab-filter ${activeTab === 'users' ? 'active' : ''}`}
        >
          <User className="w-4 h-4" />
          멤버
        </button>
        <button
          onClick={() => setActiveTab('posts')}
          className={`tab-filter ${activeTab === 'posts' ? 'active' : ''}`}
        >
          <FileText className="w-4 h-4" />
          게시물
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`tab-filter ${activeTab === 'reports' ? 'active' : ''}`}
        >
          <Flag className="w-4 h-4" />
          신고
          {MOCK_REPORTS.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {MOCK_REPORTS.length}
            </span>
          )}
        </button>
        <Link href="/admin/anon" className="tab-filter">
          <VenetianMask className="w-4 h-4" />
          익명 관리
        </Link>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'tree' && <InviteTreeTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'posts' && <PostsTab />}
        {activeTab === 'reports' && <ReportsTab />}
      </div>
    </div>
  )
}

function InviteTreeTab() {
  return (
    <div className="p-4">
      <div className="text-sm text-[#888] mb-4">
        Lobsters 스타일의 초대 트리입니다. 각 멤버가 누구를 초대했는지 확인할 수 있습니다.
      </div>
      <InviteTreeNode node={MOCK_INVITE_TREE} level={0} />
    </div>
  )
}

function InviteTreeNode({ node, level }: { node: InviteNode; level: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-2 hover:bg-[#f7f7f7] rounded transition-colors ${
          node.is_banned ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-[#888] hover:text-[#111]"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        <div className="avatar avatar-sm">
          {node.display_name.charAt(0).toUpperCase()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#111]">{node.display_name}</span>
            {node.is_banned && (
              <span className="badge bg-red-100 text-red-700">차단됨</span>
            )}
            {level === 0 && (
              <span className="badge bg-purple-100 text-purple-700">창립자</span>
            )}
          </div>
          <div className="text-xs text-[#888]">
            {node.email} · <RelativeTime date={node.joined_at} /> 가입
            {node.invited_count > 0 && ` · ${node.invited_count}명 초대`}
          </div>
        </div>
        
        {level > 0 && !node.is_banned && (
          <button
            onClick={() => toast.success(`${node.display_name}님이 차단되었습니다.`)}
            className="p-2 text-[#888] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="차단"
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <InviteTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function UsersTab() {
  const users = [
    { id: 'founder', name: '창립자', email: 'kim.real@example.com', posts: 2, is_admin: true, is_banned: false },
    { id: 'user-1', name: '김개발', email: 'lee.real@example.com', posts: 2, is_admin: false, is_banned: false },
    { id: 'user-2', name: '이프론트', email: 'park.real@example.com', posts: 1, is_admin: false, is_banned: false },
    { id: 'user-3', name: '박AI', email: 'park@example.com', posts: 0, is_admin: false, is_banned: false },
  ]

  return (
    <div className="divide-y divide-[#eee]">
      {users.map((user) => (
        <div key={user.id} className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#111]">{user.name}</span>
                {user.is_admin && <span className="badge bg-purple-100 text-purple-700">관리자</span>}
              </div>
              <div className="text-sm text-[#666]">{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#888]">{user.posts}개 게시물</span>
            {!user.is_admin && (
              <button className="p-2 text-[#888] hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                <Ban className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function PostsTab() {
  const posts = [
    { id: 'post-1', title: '효과적인 코드 리뷰 프롬프트', author: '김개발', type: 'PROMPT' },
    { id: 'post-2', title: 'Next.js 프로젝트용 Cursor Rules', author: '이프론트', type: 'CURSOR_RULES' },
    { id: 'post-3', title: '깃 커밋 메시지 자동 생성', author: '창립자', type: 'SKILL_MD' },
    { id: 'post-4', title: 'Supabase MCP 서버 설정', author: '김개발', type: 'MCP_CONFIG' },
    { id: 'post-5', title: 'AI 페어 프로그래밍 가이드', author: '창립자', type: 'NOTE' },
  ]

  return (
    <div className="divide-y divide-[#eee]">
      {posts.map((post) => (
        <div key={post.id} className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium text-[#111]">{post.title}</div>
            <div className="text-sm text-[#666]">{post.author}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge bg-[#f0f0f0] text-[#666]">{post.type}</span>
            <button
              onClick={() => toast.success('게시물이 삭제되었습니다.')}
              className="p-2 text-[#888] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportsTab() {
  if (MOCK_REPORTS.length === 0) {
    return (
      <div className="p-12 text-center">
        <Flag className="w-12 h-12 mx-auto mb-4 text-[#ddd]" />
        <p className="text-[#888]">처리할 신고가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#eee]">
      {MOCK_REPORTS.map((report) => (
        <div key={report.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-[#111]">{report.post_title}</div>
              <div className="text-sm text-[#666] mt-1">
                신고자: {report.reporter} · <RelativeTime date={report.created_at} />
              </div>
              <div className="text-sm text-[#888] mt-2">
                사유: {report.reason}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toast.success('신고가 무시되었습니다.')}
                className="btn btn-secondary btn-sm"
              >
                무시
              </button>
              <button
                onClick={() => toast.success('게시물이 삭제되었습니다.')}
                className="btn bg-red-600 text-white hover:bg-red-700 btn-sm"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
