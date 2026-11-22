'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, Bot, Archive, Users, Settings, Shield, PenSquare, LogOut, Menu, X, CalendarDays, Rocket, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { Member } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/client'
import { UserAvatar } from '@/components/user-avatar'

interface HeaderProps {
  member: Member
}

export function Header({ member }: HeaderProps) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const navItems = [
    { href: '/feed', label: '홈', icon: Home },
    { href: '/agora', label: '아고라', icon: Bot },
    { href: '/toolbox', label: '툴박스', icon: Wrench },
    { href: '/meetups', label: '모임', icon: CalendarDays },
    { href: '/products', label: '프로덕트', icon: Rocket },
    { href: '/archive', label: '아카이브', icon: Archive },
    { href: '/invites', label: '초대', icon: Users },
    { href: '/settings', label: '설정', icon: Settings },
  ]

  if (member.is_admin) {
    navItems.push({ href: '/admin', label: '관리', icon: Shield })
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-[#e5e5e5]">
        <div className="container-main">
          <div className="flex h-[60px] items-center justify-between">
            {/* Logo */}
            <Link href="/feed" className="flex-shrink-0">
              <Image
                src="/images/logo-black.png"
                alt="AI쓰발"
                width={100}
                height={30}
                priority
                className="h-7 w-auto"
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`left-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <Link href="/posts/new" className="btn btn-primary btn-sm hidden sm:flex">
                <PenSquare className="w-4 h-4" />
                글쓰기
              </Link>

              {/* User Menu */}
              <div className="relative group">
                <button className="rounded-full">
                  <UserAvatar
                    id={member.id}
                    name={member.display_name}
                    avatarUrl={member.avatar_url}
                  />
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e5e5e5] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="p-3 border-b border-[#eee]">
                    <div className="font-medium text-sm text-[#111]">{member.display_name}</div>
                    <div className="text-xs text-[#888]">{member.email}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#666] hover:bg-[#f5f5f5] transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    로그아웃
                  </button>
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-[#666] hover:text-[#111]"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-[60px] left-0 right-0 bg-white border-b border-[#e5e5e5] p-4">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`left-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="mt-4 pt-4 border-t border-[#eee]">
              <Link
                href="/posts/new"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-primary w-full"
              >
                <PenSquare className="w-4 h-4" />
                글쓰기
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav">
        {navItems.slice(0, 4).map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
