import { I18nArea } from '@/i18n/area'

/** A149: ships the English strings this area's browser code needs (see src/i18n/area.tsx). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <I18nArea area="members">{children}</I18nArea>
}
