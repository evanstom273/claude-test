import type { Tool } from '../sim/sim'

/** Small line icons for the tools, drawn in the UI colour. */
export function ToolIcon({ tool }: { tool: Tool }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      {tool === 'inspect' && (
        <g {...p}>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15 L20 20" />
        </g>
      )}
      {tool === 'raise' && (
        <g {...p}>
          <path d="M3 19 L9 10 L13 15 L16 11 L21 19 Z" />
          <path d="M12 3 V8 M9.5 5.5 L12 3 L14.5 5.5" />
        </g>
      )}
      {tool === 'lower' && (
        <g {...p}>
          <path d="M3 9 Q12 21 21 9" />
          <path d="M12 3 V8 M9.5 5.5 L12 8 L14.5 5.5" />
        </g>
      )}
      {tool === 'plants' && (
        <g {...p}>
          <path d="M12 21 V11" />
          <path d="M12 13 C7 13 5 9 5 5 C9 5 12 8 12 13 Z" />
          <path d="M12 11 C12 7 15 4 19 4 C19 8 16 11 12 11 Z" />
        </g>
      )}
      {tool === 'rain' && (
        <g {...p}>
          <path d="M6 13 A4 4 0 0 1 7 5.2 A5 5 0 0 1 16.5 6 A3.5 3.5 0 0 1 17 13 Z" />
          <path d="M8 16 L7 19 M12 16 L11 19 M16 16 L15 19" />
        </g>
      )}
      {tool === 'spawn' && (
        <g {...p}>
          <ellipse cx="12" cy="13" rx="6" ry="7" />
          <path d="M12 3 V6 M5 6 L7 8 M19 6 L17 8" />
        </g>
      )}
      {tool === 'meteor' && (
        <g {...p}>
          <circle cx="8" cy="16" r="4" />
          <path d="M11 13 L20 4 M13 16 L21 8 M8 11 L16 3" />
        </g>
      )}
    </svg>
  )
}

export const TOOL_INFO: Record<Tool, { label: string; hint: string }> = {
  inspect: { label: 'Look', hint: 'Tap a creature to follow its life. Drag to move around.' },
  raise: { label: 'Raise', hint: 'Hold to raise the land.' },
  lower: { label: 'Lower', hint: 'Hold to lower the land, or sink it into the sea.' },
  plants: { label: 'Plants', hint: 'Hold to sow plants.' },
  rain: { label: 'Rain', hint: 'Hold to make it rain: plants grow faster.' },
  spawn: { label: 'Life', hint: 'Tap to create a new species, or more of the selected one.' },
  meteor: { label: 'Meteor', hint: 'Tap to call down a meteor.' },
}
