'use client'

import { useState } from 'react'
import { Users, Copy, Check, AlertCircle, User } from 'lucide-react'
import type { Member } from '@/lib/supabase/types'
import { RelativeTime } from '@/components/relative-time'
import { toast } from 'sonner'

interface InvitesClientProps {
  member: Member
}

// Mock invite codes
const MOCK_CODES = [
  { code: 'AXK8M2PQ', isUsed: false, usedBy: null, usedAt: null },
  { code: 'B7NJ4TRW', isUsed: true, usedBy: { display_name: '새벽CTO' }, usedAt: '2026-11-18T12:00:00.000Z' },
]

export function InvitesClient({ member }: InvitesClientProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Codes become active only after the creator completed signup
  const codesActive = !!member.signup_completed_at

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success('초대 코드가 복사되었습니다.')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  function copyInviteLink(code: string) {
    const link = `${window.location.origin}/waitlist?code=${code}`
    navigator.clipboard.writeText(link)
    setCopiedCode(code)
    toast.success('초대 링크가 복사되었습니다.')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111] flex items-center gap-2">
          <Users className="w-6 h-6" />
          초대하기
        </h1>
        <p className="text-sm text-[#666] mt-1">
          AI쓰발 멤버는 2개의 초대 코드를 받습니다
        </p>
      </div>

      {/* Code Status */}
      {!codesActive && (
        <div className="card p-4 mb-4 border-l-4 border-l-amber-400 bg-amber-50/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">초대 코드가 아직 활성화되지 않았습니다</p>
              <p className="text-sm text-amber-700 mt-1">
                초대 코드를 받아 가입을 완료하면 내 초대 코드가 활성화됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invite Codes */}
      <div className="card">
        <div className="p-4 border-b border-[#e5e5e5]">
          <h2 className="font-semibold text-[#111]">내 초대 코드</h2>
          <p className="text-xs text-[#888] mt-0.5">
            각 코드는 1회만 사용할 수 있습니다
          </p>
        </div>
        
        <div className="divide-y divide-[#eee]">
          {MOCK_CODES.map((item) => (
            <div key={item.code} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`font-mono text-lg tracking-wider ${
                    item.isUsed || !codesActive ? 'text-[#aaa]' : 'text-[#111]'
                  }`}>
                    {item.code}
                  </div>
                  
                  {item.isUsed ? (
                    <span className="badge bg-green-100 text-green-700">사용됨</span>
                  ) : !codesActive ? (
                    <span className="badge bg-gray-100 text-gray-500">비활성</span>
                  ) : (
                    <span className="badge bg-blue-100 text-blue-700">사용 가능</span>
                  )}
                </div>
                
                {!item.isUsed && codesActive && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyCode(item.code)}
                      className="btn btn-secondary btn-sm"
                    >
                      {copiedCode === item.code ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      코드 복사
                    </button>
                    <button
                      onClick={() => copyInviteLink(item.code)}
                      className="btn btn-primary btn-sm"
                    >
                      링크 복사
                    </button>
                  </div>
                )}
              </div>
              
              {item.isUsed && item.usedBy && item.usedAt && (
                <div className="flex items-center gap-2 mt-3 text-sm text-[#666]">
                  <User className="w-4 h-4" />
                  <span>{item.usedBy.display_name}</span>
                  <span>·</span>
                  <span><RelativeTime date={item.usedAt} /> 사용</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="card mt-4">
        <div className="p-4 border-b border-[#e5e5e5]">
          <h2 className="font-semibold text-[#111]">초대는 어떻게 작동하나요?</h2>
        </div>
        <div className="p-4 space-y-3 text-sm text-[#555]">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#111] text-white flex items-center justify-center text-xs flex-shrink-0">1</span>
            <p>AI쓰발에 가입하면 2개의 초대 코드를 받습니다.</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#111] text-white flex items-center justify-center text-xs flex-shrink-0">2</span>
            <p>초대 코드는 초대한 멤버가 가입을 완료한 후에만 활성화됩니다.</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#111] text-white flex items-center justify-center text-xs flex-shrink-0">3</span>
            <p>활성화된 코드를 공유하면 다른 사람이 가입할 수 있습니다.</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#111] text-white flex items-center justify-center text-xs flex-shrink-0">4</span>
            <p>각 코드는 1회만 사용할 수 있으며, 사용 후 누가 사용했는지 볼 수 있습니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
