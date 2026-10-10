import type { TreeNode } from '@shared/gametree'
import InstanceIcon from './InstanceIcon'

/**
 * Keys a row by its position rather than by `fullPath`.
 *
 * Studio's listing repeats paths — a place reports several `FilteredSelection`,
 * `PluginGuiService.PluginGui` or `MemStorageService.MemStorageConnection`
 * siblings — and duplicate React keys make a re-render duplicate or strand rows,
 * so the tree showed more rows than it had nodes.
 */
export function treeKey(parentKey: string, index: number): string {
  return `${parentKey}/${index}`
}

/**
 * One explorer row plus its expanded children.
 *
 * Kept free of the store so the tree can be rendered and asserted on without a
 * live Studio connection.
 */
export default function TreeBranch({
  node,
  index = 0,
  parentKey = '',
  depth = 0,
  selectedPath,
  expanded,
  loadingChildren,
  forceExpanded = false,
  onToggle,
  onSelect
}: {
  node: TreeNode
  /** Position among its siblings, which keeps the React key unique. */
  index?: number
  /** Key of the parent row, so keys stay unique down the tree. */
  parentKey?: string
  depth?: number
  selectedPath?: string
  expanded: Record<string, boolean>
  /** Rows whose children Studio is being asked for, keyed by path. */
  loadingChildren?: Record<string, boolean>
  /** Opens every level, so a search reveals the path down to a match. */
  forceExpanded?: boolean
  onToggle: (path: string, open: boolean) => void
  onSelect: (path: string, className: string) => void
}): React.JSX.Element {
  const key = node.fullPath || 'game'
  const keyPath = treeKey(parentKey, index)
  const hasChildren = node.children.length > 0
  // A listing stops at the depth it was asked for, so a row with no children is
  // not necessarily childless — it can still be opened to read them.
  const expandable = hasChildren || node.childrenLoaded !== true
  const loading = Boolean(loadingChildren?.[key])
  // Only the top level starts expanded, as in Studio.
  const isOpen = forceExpanded || (expanded[key] ?? depth < 1)

  return (
    <div>
      <div
        className={`tree-row${selectedPath === node.fullPath ? ' selected' : ''}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        title={`${node.name || 'game'} (${node.className})`}
        onClick={() => onSelect(node.fullPath, node.className)}
      >
        <span
          className={`tree-caret${expandable ? ' has-children' : ''}${isOpen ? ' open' : ''}${
            loading ? ' loading' : ''
          }`}
          onClick={(event) => {
            event.stopPropagation()
            if (expandable) onToggle(key, !isOpen)
          }}
        />
        <InstanceIcon className={node.className} />
        {/* Studio's Explorer shows the class as a tooltip, not a second column. */}
        <span className="tree-name">{node.name || 'game'}</span>
      </div>

      {isOpen && loading && (
        <div className="explorer-note" style={{ paddingLeft: 4 + (depth + 1) * 14 }}>
          Reading children…
        </div>
      )}

      {/* Studio caps its listing, so a row can hold more than it returned. */}
      {isOpen && !loading && node.childrenTruncated && (
        <div className="explorer-note" style={{ paddingLeft: 4 + (depth + 1) * 14 }}>
          This instance has more children than Studio returned.
        </div>
      )}

      {isOpen &&
        node.children.map((child, childIndex) => (
          <TreeBranch
            key={treeKey(keyPath, childIndex)}
            node={child}
            index={childIndex}
            parentKey={keyPath}
            depth={depth + 1}
            selectedPath={selectedPath}
            expanded={expanded}
            loadingChildren={loadingChildren}
            forceExpanded={forceExpanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
