'use client'

import Link from 'next/link'
import { ChevronRight, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { signOut } from '@/components/shell/sign-out'

export function AccountSettings({ email, joinedAt, isAdmin }: { email: string; joinedAt: string | null; isAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <section className="card divide-y divide-[#eee]">
        <div className="p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-[#666] mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#333]">로그인 이메일</div>
            <div className="text-sm text-[#666] truncate">{email || '(이메일 비공개)'}</div>
            <p className="text-xs text-[#888] mt-1">본인만 확인할 수 있고 피드·게시물에 노출되지 않아요.</p>
          </div>
        </div>
        <div className="p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#666] mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-[#333]">멤버십</div>
            <div className="text-[#666]">
              {isAdmin ? '관리자' : '멤버'}
              {joinedAt ? ` · ${new Date(joinedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 가입` : ''}
            </div>
          </div>
        </div>
        <Link href="/settings/profile" className="p-4 flex items-center gap-3 min-h-[56px] hover:bg-[#fafafa]">
          <span className="text-sm font-medium text-[#333]">프로필 편집</span>
          <ChevronRight className="w-4 h-4 ml-auto text-[#bbb]" />
        </Link>
      </section>

      <section className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-[#333]">로그아웃</p>
          <p className="text-xs text-[#888]">이 기기에서 로그아웃합니다.</p>
        </div>
        <button type="button" onClick={signOut} className="btn btn-secondary btn-sm min-h-[40px]">
          <LogOut className="w-4 h-4" /> 로그아웃
        </button>
      </section>
    </div>
  )
}
