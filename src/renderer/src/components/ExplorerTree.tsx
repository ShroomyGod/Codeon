import { useMemo, useState } from 'react'
import {
  Crosshair,
  Eye,
  FolderPlus,
  History,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { countTree, filterTree } from '@shared/gametree'
import { hideInternalServices } from '@shared/services'
import { useStore } from '../store'
import TreeBranch, { treeKey } from './TreeBranch'

const MAX_RECENTS = 6

/**
 * Rows above which the "listing truncated" note explains something. With the
 * internal services hidden the tree is short enough that nobody is reading a
 * clipped listing, so the note would only be noise there.
 */
const TRUNCATION_NOTE_ROWS = 100

export default function ExplorerTree(): React.JSX.Element {
  const studio = useStore((state) => state.studio)
  const tree = useStore((state) => state.tree)
  const treeTruncated = useStore((state) => state.treeTruncated)
  const treeLoading = useStore((state) => state.treeLoading)
  const treeError = useStore((state) => state.treeError)
  const loadTree = useStore((state) => state.loadTree)
  const pullSelection = useStore((state) => state.pullSelection)
  const selectedPath = useStore((state) => state.selectedPath)
  const selectPath = useStore((state) => state.selectPath)
  const setExpanded = useStore((state) => state.setExpanded)
  const expanded = useStore((state) => state.expanded)
  const loadingChildren = useStore((state) => state.loadingChildren)
  const createInstance = useStore((state) => state.createInstance)
  const settings = useStore((state) => state.settings)
  const updateSettings = useStore((state) => state.updateSettings)

  const showInternal = settings?.showInternalServices ?? false

  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<string[]>([])
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [depth, setDepth] = useState(3)
  const [creating, setCreating] = useState(false)
  const [newClass, setNewClass] = useState('Part')
  const [newName, setNewName] = useState('NewPart')

  const filtered = useMemo(() => (tree ? filterTree(tree, query) : null), [tree, query])
  // Studio's Explorer omits the engine's bookkeeping services; so does this one,
  // unless the overflow menu asks for them. Filtering here rather than in the
  // store keeps the full tree for paths and selection.
  const visible = useMemo(
    () => (filtered ? hideInternalServices(filtered, showInternal) : null),
    [filtered, showInternal]
  )
  const shown = visible ? countTree(visible) : 0
  // Rows the filter removed, counted across the whole tree: the internal
  // services hang off the DataModel rather than sitting at the top level.
  const hiddenRows = filtered && visible ? countTree(filtered) - shown : 0
  const searching = query.trim().length > 0

  const commitSearch = (value: string): void => {
    const trimmed = value.trim()
    if (!trimmed) return
    setRecents((current) => [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, MAX_RECENTS))
  }

  if (!studio?.connected) {
    return (
      <div className="empty">
        <h2>Studio is not attached</h2>
        <p>
          Codeon attaches through the MCP server built into Roblox Studio. Turn it on under
          Studio&nbsp;→&nbsp;Assistant&nbsp;→&nbsp;MCP, keep a place open, then press Reconnect in the
          status bar. No plugin is needed.
        </p>
      </div>
    )
  }

  return (
    <div className="explorer">
      {/* Studio's Explorer leads with a bordered filter box and its own
          action buttons; the overflow menu keeps the rest. */}
      <div className="explorer-toolbar">
        <div className="explorer-filter">
          <Search size={13} />
          <input
            className="explorer-filter-input"
            placeholder="Filter the DataModel"
            value={query}
            spellCheck={false}
            aria-label="Search the DataModel"
            onChange={(event) => setQuery(event.target.value)}
            onBlur={(event) => commitSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSearch(query)
              if (event.key === 'Escape') setQuery('')
            }}
          />
          {searching && (
            <button
              className="explorer-filter-clear"
              title="Clear the filter"
              aria-label="Clear the filter"
              onClick={() => setQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className="explorer-tool"
          title="Select what is highlighted in Studio"
          onClick={() => void pullSelection()}
        >
          <Crosshair size={14} />
        </button>
        <button
          className="explorer-tool"
          title="Recent searches"
          onClick={() => setRecentsOpen((value) => !value)}
        >
          <History size={14} />
        </button>
        <button
          className="explorer-tool"
          title="More actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {recentsOpen && (
        <>
          <div className="menu-scrim" onClick={() => setRecentsOpen(false)} />
          <div className="menu">
            {recents.length === 0 && <div className="menu-note">No recent searches yet.</div>}
            {recents.map((entry) => (
              <button
                className="menu-item"
                key={entry}
                onClick={() => {
                  setQuery(entry)
                  setRecentsOpen(false)
                }}
              >
                <Search size={13} />
                {entry}
              </button>
            ))}
            {recents.length > 0 && (
              <button className="menu-item" onClick={() => setRecents((current) => current.slice(1))}>
                <Trash2 size={13} />
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {menuOpen && (
        <>
          <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
          <div className="menu">
            <button
              className="menu-item"
              onClick={() => {
                void loadTree({ depth })
                setMenuOpen(false)
              }}
            >
              <RefreshCw size={13} />
              Refresh DataModel
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setCreating(true)
                setMenuOpen(false)
              }}
            >
              <FolderPlus size={13} />
              Create instance…
            </button>

            <button
              className={`menu-item${showInternal ? ' checked' : ''}`}
              aria-pressed={showInternal}
              onClick={() => {
                void updateSettings({ showInternalServices: !showInternal })
                setMenuOpen(false)
              }}
            >
              <Eye size={13} />
              Internal services
            </button>

            <div className="menu-sep" />
            <div className="menu-label">Depth</div>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <button
                className={`menu-item${depth === value ? ' checked' : ''}`}
                key={value}
                onClick={() => {
                  setDepth(value)
                  void loadTree({ depth: value })
                  setMenuOpen(false)
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </>
      )}

      {creating && (
        <div className="explorer-create">
          <input
            className="input"
            value={newClass}
            onChange={(event) => setNewClass(event.target.value)}
            placeholder="ClassName"
          />
          <input
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name"
          />
          <button
            className="btn sm primary"
            onClick={() => {
              void createInstance({
                parent: selectedPath || 'game',
                className: newClass.trim() || 'Folder',
                name: newName.trim() || newClass.trim()
              })
              setCreating(false)
            }}
          >
            Create
          </button>
          <button className="icon-btn" title="Cancel" onClick={() => setCreating(false)}>
            <Trash2 size={13} />
          </button>
        </div>
      )}

      <div className="explorer-list">
        {treeLoading && <div className="explorer-note">Reading the DataModel…</div>}
        {treeError && <div className="review-error">{treeError}</div>}

        {visible && visible.length > 0 && (
          <div className="tree">
            {visible.map((node, index) => (
              <TreeBranch
                key={treeKey('', index)}
                node={node}
                index={index}
                selectedPath={selectedPath}
                expanded={expanded}
                loadingChildren={loadingChildren}
                forceExpanded={searching}
                onToggle={setExpanded}
                onSelect={(path, className) => void selectPath(path, className)}
              />
            ))}
          </div>
        )}

        {searching && shown === 0 && !treeLoading && (
          <div className="explorer-note">No instances match “{query.trim()}”.</div>
        )}

        {/* Says what it left out, so the missing rows are explained rather than
            mysterious, and points at the switch that brings them back. */}
        {hiddenRows > 0 && !treeLoading && !searching && (
          <div className="explorer-note">
            {hiddenRows} internal row{hiddenRows === 1 ? '' : 's'} hidden — turn on Internal
            services in the … menu to show them.
          </div>
        )}

        {treeTruncated && !searching && shown > TRUNCATION_NOTE_ROWS && (
          <div className="explorer-note">
            Listing truncated — narrow it with search or a lower depth.
          </div>
        )}

        {!tree && !treeLoading && !treeError && (
          <div className="explorer-note">Press Refresh to load the DataModel.</div>
        )}

        {/* Counts every row kept, which includes the ancestors of a match. */}
        {searching && shown > 0 && (
          <div className="explorer-note">
            {shown} row{shown === 1 ? '' : 's'} shown
          </div>
        )}
      </div>
    </div>
  )
}
