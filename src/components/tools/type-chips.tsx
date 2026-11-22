import { TOOL_SUBLABEL, TOOL_TYPE_CHIP, isOwnEntry } from '@/lib/tool-rules'
import type { ToolboxEntry } from '@/lib/supabase/types'
import { T } from '@/i18n/t'

/** Category chip (MCP · 스킬 · CLI · 서비스) with the 룰/프롬프트 sub-label, and the 제작자 badge. */
export function ToolTypeChips({ entry, maker = true }: { entry: Pick<ToolboxEntry, 'type' | 'is_own' | 'maker_ids' | 'product_id'>; maker?: boolean }) {
  const sub = TOOL_SUBLABEL[entry.type]
  return (
    <>
      <span className="cat-chip">
        <T>{TOOL_TYPE_CHIP[entry.type] ?? entry.type}</T>
        {sub && <span className="cat-sub"><T>{sub}</T></span>}
      </span>
      {maker && isOwnEntry(entry) && <span className="maker-chip"><T>제작자</T></span>}
    </>
  )
}
