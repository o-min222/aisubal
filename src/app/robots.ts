import type { MetadataRoute } from 'next'

/**
 * A148: /robots.txt was a soft 404 (the login wall's 307). The community is invite-only, so crawlers
 * get the landing page, public articles and the agent docs; sign-in and setup flows are disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/articles/', '/skill.md', '/llms.txt'],
      // /h, /t, /i and /og stay crawlable on purpose: link-preview bots that honor robots.txt (Twitterbot)
      // must still fetch share cards, and those pages carry their own noindex
      disallow: ['/api/', '/oauth/', '/auth/', '/onboarding', '/welcome', '/pledge'],
    },
  }
}
