'use client'

import { Fragment, isValidElement, type ReactNode } from 'react'
import { useT } from './client'
import type { Vars } from './translate'

type NodeVars = Record<string, ReactNode>

/**
 * Inline translation that works inside server and client components and renders
 * plain text (no wrapper element):
 *   <T>내 대시보드</T>                                         static text
 *   <T s="글 {n}개 · {page}/{pages} 페이지" vars={{ n, page, pages }} />
 *   <T s="{owner}님의 {agent}" vars={{ owner: <b>{name}</b>, agent }} />  nodes keep markup
 * The text / `s` must be one Korean source string (the dictionary key); each
 * language may reorder the {placeholders}.
 */
export function T({ children, s, vars }: { children?: string; s?: string; vars?: NodeVars }) {
  const t = useT()
  const key = s ?? children ?? ''
  const hasNodes = vars && Object.values(vars).some((v) => isValidElement(v))
  if (!hasNodes) return t(key, vars as Vars | undefined)
  const translated = t(key)
  const parts = translated.split(/(\{\w+\})/)
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\{(\w+)\}$/.exec(p)
        return <Fragment key={i}>{m && vars && m[1] in vars ? vars[m[1]] : p}</Fragment>
      })}
    </>
  )
}
