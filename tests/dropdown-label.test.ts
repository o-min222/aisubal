import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A40: Base UI's Menu.GroupLabel throws outside <Menu.Group>, which crashed
// /settings/profile as soon as a stack chip's menu opened.
describe('DropdownMenuLabel', () => {
  it('does not depend on a Menu.Group context', () => {
    const src = readFileSync('src/components/ui/dropdown-menu.tsx', 'utf8')
    const label = src.slice(src.indexOf('function DropdownMenuLabel('), src.indexOf('function DropdownMenuItem('))
    expect(label).not.toContain('MenuPrimitive.GroupLabel')
  })
})
