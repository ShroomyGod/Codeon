import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * The breadcrumb trail VS Code draws under the editor tabs, pointing at the
 * instance the editor area is showing.
 *
 * Each crumb after the root carries the path prefix that selects it, so a click
 * walks back up the DataModel instead of having to re-find the row in the tree.
 */
export function crumbPaths(path: string): string[] {
  const parts = path.split('.').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'))
}

export function crumbLabel(path: string): string {
  const parts = path.split('.')
  return parts[parts.length - 1] || path
}

export default function Breadcrumbs({
  path,
  className,
  onPick
}: {
  /** Instance path being shown, or null when the view has no target yet. */
  path: string | null
  /** Class of the target, shown as the trailing symbol crumb. */
  className?: string
  onPick?: (path: string) => void
}): React.JSX.Element | null {
  const crumbs = path ? crumbPaths(path) : []
  if (crumbs.length === 0) return null

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <span className="crumb crumb-root">game</span>
      {crumbs.map((crumb) => (
        <Fragment key={crumb}>
          <span className="crumb-sep" aria-hidden="true">
            <ChevronRight size={12} />
          </span>
          <button
            className={`crumb${crumb === path ? ' current' : ''}`}
            title={crumb}
            onClick={() => onPick?.(crumb)}
          >
            {crumbLabel(crumb)}
          </button>
        </Fragment>
      ))}
      {className && <span className="crumb-symbol">{className}</span>}
    </nav>
  )
}
