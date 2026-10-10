import type { GameTreeNode } from './types'

export interface TreeNode {
  fullPath: string
  name: string
  className: string
  children: TreeNode[]
  /**
   * True once the children here are everything Studio reported for this node.
   * A listing only goes as deep as it was asked to, so a row at the edge of one
   * has children nobody has read yet — the explorer fetches those when the row
   * is opened instead of treating the instance as childless.
   */
  childrenLoaded?: boolean
  /** True when Studio's own result limit cut this node's children short. */
  childrenTruncated?: boolean
}

export interface BuildTreeOptions {
  /**
   * How many levels of children the listing actually contained. Rows at that
   * depth are left with unknown children. Omit it when Studio truncated the
   * listing — then no row can be trusted as complete.
   */
  loadedDepths?: number
}

/**
 * Studio's `search_game_tree` returns a **flat** list where each entry carries a
 * `fullPath`, and top-level services carry the DataModel's name in
 * `parentName`:
 *
 *   [ { fullPath: 'Place1', className: 'DataModel' },
 *     { fullPath: 'Workspace', parentName: 'Place1', className: 'Workspace' },
 *     { fullPath: 'Workspace.Baseplate', parentName: 'Workspace', className: 'Part' } ]
 *
 * This rebuilds the nesting the explorer wants. Nodes whose parent is missing
 * (a truncated listing) become roots rather than disappearing.
 */
export function buildGameTree(nodes: GameTreeNode[], options: BuildTreeOptions = {}): TreeNode[] {
  const trees: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()
  const pathSet = new Set(nodes.map((node) => node.fullPath))

  for (const node of nodes) {
    const tree: TreeNode = {
      fullPath: node.fullPath,
      name: node.name || node.fullPath,
      className: node.className || 'Instance',
      children: []
    }
    trees.push(tree)
    if (!byPath.has(node.fullPath)) byPath.set(node.fullPath, tree)
  }

  const byName = new Map<string, TreeNode>()
  for (const tree of trees) {
    if (!byName.has(tree.name)) byName.set(tree.name, tree)
  }

  const roots: TreeNode[] = []
  for (let index = 0; index < trees.length; index += 1) {
    const tree = trees[index]
    const source = nodes[index]
    const parentPath = findParentPath(source, pathSet)
    const parent = parentPath ? byPath.get(parentPath) : undefined
    if (parent && parent !== tree) parent.children.push(tree)
    else roots.push(tree)
  }

  if (options.loadedDepths !== undefined) {
    const mark = (tree: TreeNode, depth: number): void => {
      tree.childrenLoaded = depth < options.loadedDepths!
      for (const child of tree.children) mark(child, depth + 1)
    }
    for (const root of roots) mark(root, 0)
  }

  return roots
}

/**
 * Picks the children of `path` out of a listing scoped to that instance.
 *
 * Studio answers a scoped `search_game_tree` with the instance itself followed
 * by its descendants, so a row's children sit one level under the root it
 * echoes back. Returns null when the listing says nothing about `path` at all.
 */
export function childTree(
  nodes: GameTreeNode[],
  path: string,
  loadedDepths?: number
): TreeNode[] | null {
  const built = buildGameTree(nodes, { loadedDepths })
  const root = indexTree(built).get(path)
  if (root) return root.children
  // Studio left the instance out; anything named as its descendant still counts.
  const descendants = built.filter((node) => node.fullPath.startsWith(`${path}.`))
  return descendants.length > 0 ? descendants : null
}

/**
 * Swaps one row's children, sharing every branch that did not change so React
 * re-renders the opened row rather than the whole tree.
 */
export function graftChildren(
  roots: TreeNode[],
  path: string,
  children: TreeNode[],
  truncated = false
): TreeNode[] {
  const graft = (node: TreeNode): TreeNode => {
    if (node.fullPath === path) {
      return { ...node, children, childrenLoaded: true, childrenTruncated: truncated }
    }
    // Every branch is walked rather than pruned by path prefix: a service hangs
    // off the DataModel through `parentName` alone, so a tree path is not
    // necessarily a name prefix of the descendants' paths. Untouched branches
    // are handed back by identity, so only the opened row re-renders.
    let changed = false
    const next = node.children.map((child) => {
      const updated = graft(child)
      if (updated !== child) changed = true
      return updated
    })
    return changed ? { ...node, children: next } : node
  }

  return roots.map(graft)
}

function findParentPath(node: GameTreeNode, pathSet: Set<string>): string | null {
  // `Workspace.Baseplate` -> `Workspace`
  const dot = node.fullPath.lastIndexOf('.')
  if (dot > 0) {
    const candidate = node.fullPath.slice(0, dot)
    return pathSet.has(candidate) ? candidate : null
  }
  // A service reports the DataModel through `parentName`.
  if (node.parentName) return pathSet.has(node.parentName) ? node.parentName : null
  return null
}

/**
 * Filters a tree by name, the way Studio's Explorer search box does.
 *
 * A node is kept when it matches, or when any descendant matches — so a hit
 * deep in the tree still shows the path down to it. Depth and order are
 * otherwise preserved, and the query is matched case-insensitively.
 */
export function filterTree(roots: TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return roots

  const keep = (node: TreeNode): TreeNode | null => {
    const selfMatches =
      node.name.toLowerCase().includes(needle) || node.className.toLowerCase().includes(needle)
    const children = node.children.map(keep).filter((child): child is TreeNode => child !== null)
    if (selfMatches) return { ...node, children: node.children }
    if (children.length > 0) return { ...node, children }
    return null
  }

  return roots.map(keep).filter((node): node is TreeNode => node !== null)
}

/** Counts the nodes a filtered tree would show, for an empty-state message. */
export function countTree(roots: TreeNode[]): number {
  let total = 0
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      total += 1
      walk(node.children)
    }
  }
  walk(roots)
  return total
}

/** Flattens a tree back to a path -> node map, for lookups while rendering. */
export function indexTree(roots: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>()
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      map.set(node.fullPath, node)
      walk(node.children)
    }
  }
  walk(roots)
  return map
}
