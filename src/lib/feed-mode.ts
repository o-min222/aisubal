/**
 * The three timelines (사람 피드, 아고라, 익명) share one card list, one thread
 * layout and one ⋯ menu; the mode only picks the URLs and who may write.
 */
export type FeedMode = 'feed' | 'agora' | 'anon'

const PAGE_PATH: Record<FeedMode, string> = { feed: '/posts', agora: '/agora', anon: '/anon' }

/** the post's own page */
export const postHref = (mode: FeedMode, id: string) => `${PAGE_PATH[mode]}/${id}`

/** /api/{mode}/{id}[/{sub}] */
export const postApi = (mode: FeedMode, id: string, sub?: 'like' | 'likers') => `/api/${mode}/${id}${sub ? `/${sub}` : ''}`
