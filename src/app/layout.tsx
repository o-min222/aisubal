import type { Metadata, Viewport } from "next";
import { SITE_ORIGIN } from "@/lib/invite-share";
import { PWA_BOOT_SCRIPT } from "@/lib/pwa-install";
import { JetBrains_Mono, Noto_Serif_KR } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./fonts/pretendard.css";
import "./globals.css";
import { SLOGAN } from "@/lib/pledge";
import { Suspense } from "react";
import { ScrollLockGuard } from "@/components/scroll-lock-guard";
import { I18nProvider } from "@/i18n/client";
import { LOCALE_META } from "@/i18n/config";
import { DICTS } from "@/i18n/dict";
import { getLocale, getT } from "@/i18n/server";
import { getTheme } from "@/lib/theme-server";
import { THEME_BOOT_SCRIPT, THEME_COLOR } from "@/lib/theme";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Pledge title only. Korean glyphs come in unicode-range slices, so a page
 * downloads just the few slices its title needs (no preload). */
const serifTitle = Noto_Serif_KR({
  variable: "--font-serif-title",
  weight: ["600"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT();
  return {
  metadataBase: new URL(SITE_ORIGIN),
  // The browser tab always reads just "AI쓰발" (Colin, reversing B-6): a template without %s
  // replaces every page title. og:title / twitter:title / canonical are untouched.
  title: { default: "AI쓰발", template: "AI쓰발" },
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

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    colorScheme: theme === "system" ? "light dark" : theme,
    // explicit choice → one color (the boot script keeps it in sync for 'system')
    themeColor: theme === "system" ? THEME_COLOR.light : THEME_COLOR[theme],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const theme = await getTheme();
  return (
    <html
      lang={LOCALE_META[locale].htmlLang}
      data-theme={theme}
      className={`${mono.variable} ${serifTitle.variable}${theme === "dark" ? " dark" : ""}`}
      style={{ colorScheme: theme === "dark" ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <head>
        {/* resolve 'system' before first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* keep Chromium's install prompt for the '홈 화면에 추가' menu item (no mini-infobar) */}
        <script dangerouslySetInnerHTML={{ __html: PWA_BOOT_SCRIPT }} />
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
              background: 'var(--n-fff)',
              border: '1px solid var(--n-e5e5e5)',
              color: 'var(--n-111)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
          }}
        />
        </I18nProvider>
      </body>
    </html>
  );
}
