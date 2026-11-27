'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { UserAvatar } from '@/components/user-avatar'
import type { ArticleComment } from '@/lib/data/articles'
import { ARTICLE_COMMENT_MAX } from '@/lib/article-rules'
import { MentionText } from '@/components/timeline/mention-text'

export function ArticleComments({
  articleId,
  initial,
  signedIn,
}: {
  articleId: string
  initial: ArticleComment[]
  signedIn: boolean
}) {
  const [items, setItems] = useState(initial)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<ArticleComment | null>(null)
  const [busy, setBusy] = useState(false)

  const roots = items.filter((c) => !c.parentId)
  const repliesOf = (id: string) => items.filter((c) => c.parentId === id)

  async function submit(parent?: ArticleComment | null) {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    const res = await fetch(`/api/articles/${articleId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, parentId: parent?.parentId ?? parent?.id ?? null, replyToId: parent?.id ?? null }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(data.error || tn('댓글을 남기지 못했어요.'))
    setItems((list) => [...list, data.comment as ArticleComment])
    setBody('')
    setReplyTo(null)
  }

  async function remove(id: string) {
    if (!confirm(tn('이 댓글을 삭제할까요?'))) return
    const res = await fetch(`/api/articles/comments/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('삭제하지 못했어요.'))
    setItems((list) => list.map((c) => (c.id === id ? { ...c, deleted: true, body: null } : c)))
  }

  return (
    <section id="article-comments" className="article-comments">
      <h2 className="article-comments-title"><T s="댓글 {n}" vars={{ n: items.filter((c) => !c.deleted).length }} /></h2>
      {signedIn ? (
        <form
          className="article-comment-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(replyTo)
          }}
        >
          {replyTo && (
            <p className="text-xs text-n-888">
              <T s="{name}님에게 답글" vars={{ name: replyTo.author.name }} />{' '}
              <button type="button" className="body-link" onClick={() => setReplyTo(null)}><T>취소</T></button>
            </p>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, ARTICLE_COMMENT_MAX))}
            className="input"
            rows={3}
            placeholder={tx('댓글을 남겨 보세요.')}
            maxLength={ARTICLE_COMMENT_MAX}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !body.trim()}><T>등록</T></button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-n-888"><T>댓글을 쓰려면 로그인해 주세요.</T></p>
      )}
      <ul className="article-comment-list">
        {roots.map((c) => (
          <li key={c.id} className="article-comment">
            <CommentRow c={c} onReply={signedIn ? setReplyTo : undefined} onDelete={remove} />
            {repliesOf(c.id).length > 0 && (
              <ul className="article-comment-replies">
                {repliesOf(c.id).map((r) => (
                  <li key={r.id}>
                    <CommentRow c={r} onReply={signedIn ? setReplyTo : undefined} onDelete={remove} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommentRow({
  c,
  onReply,
  onDelete,
}: {
  c: ArticleComment
  onReply?: (c: ArticleComment) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="article-comment-row">
      <UserAvatar id={c.author.id} name={c.author.name} avatarUrl={c.author.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="article-comment-name">{c.author.name}</p>
        <p className="article-comment-body">{c.deleted ? <T>삭제된 댓글이에요.</T> : <MentionText text={c.body ?? ''} />}</p>
        {!c.deleted && (
          <p className="article-comment-tools">
            {onReply && (
              <button type="button" onClick={() => onReply(c)}><T>답글</T></button>
            )}
            {c.isMine && (
              <button type="button" onClick={() => onDelete(c.id)}><T>삭제</T></button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
