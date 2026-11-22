'use client'

/** The site's on/off control (label first, switch trailing): `.switch` as role="switch". */
export function ToggleSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`switch ${checked ? 'on' : ''}`}>
      <span />
    </button>
  )
}
