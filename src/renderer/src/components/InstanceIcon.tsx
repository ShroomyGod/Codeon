import { ICON_COLORS, ICON_SHAPES, familyFor, type IconShape } from './instanceIcons'

/**
 * Explorer icon for a Roblox class.
 *
 * Hidden from assistive tech: the tree row already announces the class name and
 * instance name, so the icon is decoration.
 */
export default function InstanceIcon({
  className,
  size = 14
}: {
  className: string
  size?: number
}): React.JSX.Element {
  const family = familyFor(className)

  return (
    <svg
      className="instance-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ color: ICON_COLORS[family] }}
      aria-hidden="true"
      focusable="false"
    >
      {ICON_SHAPES[family].map((shape, index) => renderShape(shape, index))}
    </svg>
  )
}

function renderShape(shape: IconShape, index: number): React.JSX.Element {
  switch (shape.kind) {
    case 'stroke':
      return (
        <path
          key={index}
          d={shape.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.width ?? 1}
          strokeLinecap="round"
          opacity={shape.opacity}
        />
      )
    case 'circle':
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} opacity={shape.opacity} />
    case 'rect':
      return (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          opacity={shape.opacity}
        />
      )
    default:
      return <path key={index} d={shape.d} opacity={shape.opacity} />
  }
}
