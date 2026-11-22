'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { letterHue, serviceIconUrl } from '@/lib/service-logos'

/** 14px logo: catalog icon → known service logo → tiny letter mark. */
export function ServiceIcon({ label, iconUrl }: { label: string; iconUrl?: string | null }) {
  const src = iconUrl || serviceIconUrl(label)
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={14} height={14} loading="lazy" className="svc-icon" onError={() => setFailed(true)} />
  }
  return (
    <span className="svc-icon svc-letter" style={{ background: letterHue(label) }} aria-hidden>
      {label.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The one compact chip (≈24px, 12px text, 14px logo) for AI stack, subscriptions,
 * skills and tools: profile card, member peek, profile page, editor, tool users.
 */
export function ServiceChip({ label, iconUrl, href, title, trailing, className = '' }: { label: string; iconUrl?: string | null; href?: string; title?: string; trailing?: ReactNode; className?: string }) {
  const inner = (
    <>
      <ServiceIcon label={label} iconUrl={iconUrl} />
      <span className="svc-label">{label}</span>
      {trailing}
    </>
  )
  return href ? (
    <Link href={href} className={`svc-chip is-link ${className}`} title={title ?? label}>
      {inner}
    </Link>
  ) : (
    <span className={`svc-chip ${className}`} title={title ?? label}>
      {inner}
    </span>
  )
}
