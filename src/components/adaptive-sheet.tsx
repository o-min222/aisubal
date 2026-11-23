'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * Bottom sheet on phones (native-app feel), centered dialog on desktop.
 * Used for liker lists, filters, share and the "더보기" menu.
 */
export function AdaptiveSheet({
  open,
  onOpenChange,
  title,
  children,
  className = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  className?: string
}) {
  const desktop = useMediaQuery('(min-width: 768px)')
  // Close on navigation so a sheet never stays open (and scroll-locked) on the next page.
  // Compares with the last pathname (not a first-run flag), so StrictMode's double effect
  // doesn't close a sheet that starts open (e.g. a ?badges= deep link).
  const pathname = usePathname()
  const shownAt = useRef(pathname)
  useEffect(() => {
    if (shownAt.current === pathname) return
    shownAt.current = pathname
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`max-w-sm ${className}`}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={`bottom-sheet ${className}`}>
        <div className="bottom-sheet-handle" aria-hidden />
        <SheetHeader className="pb-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
