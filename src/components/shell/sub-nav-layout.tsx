"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  Shield,
} from "lucide-react";
import { ADMIN_SECTIONS, SETTINGS_SECTIONS, subNavActive } from "./account-nav";
import { useT } from "@/i18n/client";
import { msg } from '@/i18n/translate'

const AREAS = {
  settings: {
    title: msg("설정"),
    icon: Settings,
    base: "/settings",
    items: SETTINGS_SECTIONS,
  },
  admin: { title: msg("관리"), icon: Shield, base: "/admin", items: ADMIN_SECTIONS },
} as const;

/**
 * Full-page settings / admin shell (the app's left panel and right rail are hidden
 * via CSS): a back-to-app bar, a section list on desktop; on mobile the index route shows
 * the list and each section is a drill-down detail with a back link.
 */
export function SubNavLayout({
  area,
  children,
}: {
  area: keyof typeof AREAS;
  children: React.ReactNode;
}) {
  const t = useT();
  const { icon: Icon, base, items } = AREAS[area];
  const title = t(AREAS[area].title);
  const pathname = usePathname();
  const atIndex = pathname === base;
  const current = items.find((i) =>
    subNavActive(pathname, i.href, base, items[0].href),
  );
  return (
    <div className="subnav-page">
      <div className="subnav-appbar">
        <Link
          href="/feed"
          className="subnav-appback"
          aria-label={t("앱으로 돌아가기")}
        >
          <ArrowLeft className="w-4 h-4" /> {t("앱으로 돌아가기")}
        </Link>
      </div>
      <div className={`subnav-layout ${atIndex ? "at-index" : ""}`}>
        <nav className="subnav" aria-label={t("{area} 메뉴", { area: title })}>
          <h1 className="subnav-title" style={{ color: "#111" }}>
            <Icon className="w-5 h-5" /> {title}
          </h1>
          {items.map((i) => {
            const on = subNavActive(pathname, i.href, base, items[0].href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`subnav-item ${on ? "active" : ""}`}
                aria-current={on ? "page" : undefined}
              >
                <i.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block">{t(i.label)}</span>
                  {i.hint && <span className="hint">{t(i.hint)}</span>}
                </span>
                <ChevronRight className="chev w-4 h-4" />
              </Link>
            );
          })}
        </nav>
        <section
          className="subnav-detail min-w-0"
          aria-label={current ? t(current.label) : title}
        >
          <Link href={base} className="subnav-back">
            <ChevronLeft className="w-4 h-4" /> {title}
          </Link>
          {children}
        </section>
      </div>
    </div>
  );
}

/** Section heading used inside settings / admin detail pages. */
export function SubPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const t = useT();
  return (
    <header className="mb-4">
      <h2 className="text-xl font-bold" style={{ color: "#111" }}>
        {t(title)}
      </h2>
      {description && <p className="text-sm text-[#666] mt-1">{t(description)}</p>}
    </header>
  );
}
