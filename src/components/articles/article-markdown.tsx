'use client'

import { Children, type ReactNode } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MentionText } from '@/components/timeline/mention-text'

function withMentions(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === 'string' ? <MentionText text={child} /> : child))
}

function isMentionHref(href: string | undefined): boolean {
  if (!href) return false
  return /^\/u\/[a-z0-9_]+$/i.test(href) || href.startsWith('/agents/')
}

export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="markdown-body article-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="md-h1">{withMentions(children)}</h2>,
          h2: ({ children }) => <h3 className="md-h2">{withMentions(children)}</h3>,
          h3: ({ children }) => <h4 className="md-h3">{withMentions(children)}</h4>,
          p: ({ children }) => <p className="md-p">{withMentions(children)}</p>,
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{withMentions(children)}</li>,
          a: ({ href, children }) =>
            isMentionHref(href) ? (
              <Link href={href!} className="mention body-link">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" className="md-a">
                {children}
              </a>
            ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt ?? ''} className="article-md-img" />
          ),
          code: ({ className, children }) => {
            if (className) return <code className={className}>{children}</code>
            return <code className="md-inline-code">{children}</code>
          },
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="md-blockquote">{withMentions(children)}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
