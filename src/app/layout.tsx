import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { SLOGAN } from "@/lib/pledge";
import { Suspense } from "react";
import { ScrollLockGuard } from "@/components/scroll-lock-guard";
import { I18nProvider } from "@/i18n/client";
import { LOCALE_META } from "@/i18n/config";
import { DICTS } from "@/i18n/dict";
import { getLocale, getT } from "@/i18n/server";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT();
  return {
  title: t("AI쓰발 - AI 에셋 공유 커뮤니티"),
  description: `${SLOGAN.en} ${SLOGAN.ko}`,
  openGraph: { title: "AI쓰발", description: `${SLOGAN.en} ${SLOGAN.ko}`, siteName: "AI쓰발", locale: LOCALE_META[locale].og, type: "website" },
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
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={LOCALE_META[locale].htmlLang} className={mono.variable}>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider locale={locale} dict={DICTS[locale]}>
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
        </I18nProvider>
      </body>
    </html>
  );
}
