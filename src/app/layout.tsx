import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { SLOGAN } from "@/lib/pledge";
import { Suspense } from "react";
import { ScrollLockGuard } from "@/components/scroll-lock-guard";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI쓰발 - AI 에셋 공유 커뮤니티",
  description: `${SLOGAN.en} ${SLOGAN.ko}`,
  openGraph: { title: "AI쓰발", description: `${SLOGAN.en} ${SLOGAN.ko}`, siteName: "AI쓰발", locale: "ko_KR", type: "website" },
  applicationName: "AI쓰발",
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "AI쓰발",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={mono.variable}>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Suspense fallback={null}>
          <ScrollLockGuard />
        </Suspense>
        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              background: '#ffffff',
              border: '1px solid #e5e5e5',
              color: '#111111',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
          }}
        />
      </body>
    </html>
  );
}
