import { SITE_ORIGIN } from './invite-share'

/**
 * AI-8: the branded share card (public/images/og-default.png, 1200×630, no member content).
 * Absolute URL: link scrapers (KakaoTalk `kakaotalk-scrap`, Slack, X) fetch it signed out, and
 * middleware skips *.png so it never redirects. Pages that set their own openGraph must list it too
 * (a page's openGraph replaces the layout's, images included).
 */
export const OG_DEFAULT = { url: `${SITE_ORIGIN}/images/og-default.png`, width: 1200, height: 630, alt: 'AI쓰발' }
