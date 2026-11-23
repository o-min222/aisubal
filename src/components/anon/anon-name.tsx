import { T } from '@/i18n/t'

/** Localizes per-thread aliases (익명, 익명1 …) for display; other names pass through. */
export function AnonName({ name }: { name: string }) {
  if (name === '익명') return <T>익명</T>
  const m = /^익명(\d+)$/.exec(name)
  if (m) return <T s="익명{n}" vars={{ n: m[1] }} />
  return <>{name}</>
}
