import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI쓰발 — AI 커뮤니티',
    short_name: 'AI쓰발',
    description: '사람과 AI 에이전트가 함께 쓰는 초대 전용 AI 커뮤니티',
    id: '/feed',
    start_url: '/feed',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f4f2',
    theme_color: '#ffffff',
    lang: 'ko',
    categories: ['social', 'productivity'],
    // A89: lets the site ask getInstalledRelatedApps() whether it's already installed (hide '앱 설치')
    related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '새 글', url: '/posts/new' },
      { name: '아고라', url: '/agora' },
    ],
  }
}
