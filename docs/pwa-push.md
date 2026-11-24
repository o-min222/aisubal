# PWA, notifications and web push

## PWA

- `src/app/manifest.ts`: name 'AI쓰발 — AI 커뮤니티', `start_url: /feed`, `display: standalone`, with shortcuts to 새 글 and 아고라.
- `public/sw.js` registers at scope `/`. **It caches nothing**, because pages are per member. Navigations use navigation preload and fall back to a small offline page. The worker also handles `push`, `notificationclick` and `pushsubscriptionchange`.
- `src/lib/pwa-install.ts` decides the install path (`installMode`: `'prompt' | 'ios' | 'android' | null`). On Chromium it keeps `beforeinstallprompt` and calls `prompt()` on one tap. On iOS Safari, which has no prompt, it explains Share → 홈 화면에 추가. Android Chrome and Samsung Internet don't always fire the event, so without it they get the browser-menu steps (⋮ → 앱 설치, or ≡ → 현재 페이지 추가 → 홈 화면). In-app browsers, Firefox and desktop browsers without a prompt get nothing. It also registers `/sw.js`, which is skipped on localhost unless `?sw=1`.
- Install entry point (A89): a compact '앱 설치' button beside the profile row of the account menu (`account-menu.tsx`, sheet and dropdown). The help sheet is `src/components/pwa/install-help-sheet.tsx`. The button hides when running standalone, after `appinstalled`, or when `navigator.getInstalledRelatedApps()` finds the app. The manifest lists itself in `related_applications` (`platform: 'webapp'`, `prefer_related_applications: false`) for that check.
- `/settings/app` (모바일 앱) offers 홈 화면에 추가 and **폰으로 보내기**: a QR device handoff from desktop to phone. The handoff is short-lived and single-use, and only its sha256 is stored (0072).

## In-app notifications

- `notifications` rows are created by DB triggers (`notify__*`, from 0048 on), never by clients. Each row has a category, and members switch categories on or off in `/settings/notifications` (`notification_prefs`). The categories are 새 소식 (digest) · 댓글 · 좋아요 · 팔로잉 새 글 · 팔로우·친구 · 모임 · 갤러리 · 새 멤버 · 초대 · 내 AI · 배지.
- Likes on the same post and runs of posts by one person are grouped into one row.
- The bell (`notification-bell.tsx`) polls `/api/notifications/unread`, which returns `{ unread, requests }`. It loads rows through the server action `loadNotificationChunk` (`src/app/actions/notifications.tsx`).
- **Friend requests (A86):** pending `friend_request` rows are pinned at the top of page 1 in the bell and on `/notifications`, with inline 수락/거절. The trigger deletes the row when the request is accepted or declined. The requests count also drives the avatar dot, the '신청 N' badge in the account menu, and the feed card.

## Web push

```
notifications row ──notify__push──▶ push_outbox ──pg_net nudge──▶ POST /api/push/dispatch
                                                                  │  claim (RPC, secret-gated)
                                                                  ▼
                                                     web-push (VAPID) ──▶ device ──▶ sw.js
                                                                  │  report (RPC)
```

- 0075: `push_subscriptions` holds one row per device (endpoint + keys; RLS owner-only). `push_outbox` is the queue, and `push_config` holds the dispatcher secret's **sha256** and the dispatch URL.
- `notify__push` applies the member's category toggles, so only allowed rows reach the outbox.
- `/api/push/dispatch` runs on the **anon key**. Claim and report are SECURITY DEFINER RPCs gated by `PUSH_DISPATCH_SECRET`, so a stray call can only drain the queue. Vercel Cron also sweeps it daily (`vercel.json`, gated by `CRON_SECRET`). Endpoints and keys are never logged. A subscription the push service reports gone is deleted at once; others are dropped after 5 consecutive failures (`push_dispatch_report`).
- Payload copy lives in `src/lib/push-rules.ts` (`{ title, body, url, tag, badge }`). A friend request reads '새 친구 신청' / '{name}님이 친구 신청을 보냈어요…' and opens `/members/me/social?tab=requests`.
- Device controls are in `/settings/notifications`: enable, test (`/api/push/test`), status, unsubscribe.
- **Digest (0110/0111):** a gentle '새 소식' push from pg_cron, at most once every 20 h (weekly mode: about once a week). It only runs 09:00–21:59 KST, skips members who were active recently, and covers only 전체 회원, real-name, non-group member posts. Thresholds (`digest_min_posts`, `digest_hot_min`) are in site settings. The in-app row is stored as already read.

Env vars (values in Vercel, never in the repo): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_DISPATCH_SECRET`, `CRON_SECRET`.
