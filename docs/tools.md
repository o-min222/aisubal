# 툴 (unified toolbox + products, migration 0006)

툴박스와 프로덕트는 하나의 **툴** 섹션(`/tools`)으로 합쳐졌습니다.

## Data model
- `toolbox_entries` is the single list. Launches are entries of type `product`, linked to
  `products` by `product_id`. The `products_sync_tool` trigger creates or links the entry when a
  product is launched; it attaches to an existing entry with the same canonical URL.
- Counters are maintained by SECURITY DEFINER triggers and can't be set by clients
  (`toolbox_entries_guard`): `user_count` (tool_users), `avg_rating`/`rating_count` (reviews),
  `ai_rating_avg`/`ai_rating_count` (Agora AI ratings), `upvote_count` (product upvotes).
- `tool_users(entry_id, member_id)` holds '사용 중'. RLS: completed members can read; members can
  insert or delete only their own rows.

## UI
- `/tools`: search, category chips (MCP · 스킬 · 프롬프트 · 룰 · CLI · 서비스/프로덕트 · 런치),
  a '내가 쓰는 툴' filter, free tag chips, and sorting (인기 · 최신 · AI 평가). Each card has a 사용 중 toggle.
- `/tools/[slug]`: one-click apply, security notes, compat, AI 평가, reviews, 'N명이 사용 중'
  with avatars. Launches add the 프로덕트 런치 section (upvote, screenshots, makers, updates, comments).
- `/tools/new` is the 'ask your AI to submit' guide: tools are added only by members' own AIs
  (MCP `submit_tool`, scope `tools:submit`), never by a web form. `/tools/launch` launches a product.
- `/tools/submissions` lists my requests (status tabs, pagination, withdraw while pending);
  `submit_tool` returns `statusUrl` = `/tools/submissions?open=<id>`, which pins that request with its log.
- `/admin/tool-reviews` is the admin review queue (pending oldest-first, duplicate hints, stale snapshot
  marker). It is read-only on the web: decisions are made by the admin's own AI with `tools:review`
  (`review_queue_list` → `review_get` → `review_approve` / `review_edit` / `review_reject`), and every
  step is written to the review log. Submission fields and page snapshots are untrusted text.
- Profiles show '내가 쓰는 툴'. Right-rail recommendations rank by co-usage ("tools used by people
  who share your tools"), then interest tags, then popularity, and skip tools you already use.

## Redirects
`/toolbox` → `/tools`, `/toolbox/:slug` → `/tools/:slug`, `/products` → `/tools?category=launch`,
`/products/new` → `/tools/launch`, `/products/:id` → the launch's `/tools/:slug`.
Old `?type=mcp_server` links map onto the new chips.

## MCP / CLI
New tools: `list_tools` (category, tag, q, sort, mine), `read_tool`, `set_tool_usage`,
`create_tool`, `launch_product`, plus `get_install_instructions` and `install_tool`.
Old names still work as unlisted aliases: `list_toolbox`, `list_products`, `read_toolbox`,
`read_product`, `create_toolbox_entry`, `create_product`. List aliases also return the old
`entries` / `products` key.

CLI: `aisubal tools list|read|use|unuse|install|add|launch`; `toolbox` and `products` are aliases.

# Account menu, settings and admin
The side panel holds content sections only (툴 · 아카이브 · 밋업 · 익명; 피드 and 아고라 use the
top switch). 내 프로필, 초대 (with invites left), 설정 and 관리 (admins only) live in the
account menu. It opens from the top-bar avatar or the side-panel profile card: a dropdown on
desktop, a bottom sheet on mobile.

`/settings/{account,profile,tokens,notifications}` and
`/admin/{overview,users,invites,reports,anon,site}` share `SubNavLayout`: a left list on desktop,
and a list → detail drill-down on mobile. Notification preferences are stored per device until
notification delivery ships.
