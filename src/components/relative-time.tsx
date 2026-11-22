'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

function format(date: string | Date, addSuffix: boolean) {
  return formatDistanceToNow(new Date(date), { addSuffix, locale: ko })
}

export function RelativeTime({
  date,
  addSuffix = true,
}: {
  date: string | Date
  addSuffix?: boolean
}) {
  const [label, setLabel] = useState(() => format(date, addSuffix))

  useEffect(() => {
    setLabel(format(date, addSuffix))
  }, [date, addSuffix])

  return (
    <span suppressHydrationWarning data-testid="relative-time">
      {label}
    </span>
  )
}
