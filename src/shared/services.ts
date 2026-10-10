import type { TreeNode } from './gametree'
import { SERVICE_CLASSES } from './serviceClasses'

/**
 * The services Studio's own Explorer lists at the root of a place.
 *
 * Studio decides this from a list inside the engine (`ServiceVisibilityService`'s
 * `HiddenServices`, which is `RobloxSecurity` — not readable from a plugin or from
 * Studio's MCP server, so it cannot be mirrored automatically) and from its
 * "Show Hidden Objects in Explorer" setting. This is the curated equivalent: the
 * services a place is actually browsed for. In a real place the DataModel holds
 * 120+ services, and without this the Explorer opened on rows of engine plumbing
 * — `RunService`, `Stats`, `ContentProvider`, the debuggers, the asset pipeline —
 * before reaching `Workspace`.
 *
 * Deliberately not here: `Chat` (the legacy chat service Studio dropped in favour
 * of `TextChatService`) and `Debris`. `CoreGui` and `PluginGuiService` are out for
 * the same reason Studio gates them behind its own settings — "Show Core GUI in
 * Explorer while Playing" and "Show Plugin GUI Service in Explorer" — which exist
 * because the default is not to draw them.
 *
 * Anything not on this list but classed as a service (see `SERVICE_CLASSES`, which
 * is generated from Roblox's API dump) is treated as internal, so a service Roblox
 * adds later starts out hidden rather than appearing in the tree.
 *
 * Getting the list wrong is survivable by design: `showInternalServices` (the
 * Explorer's overflow menu, as Studio's own setting) puts every one of them back.
 */
export const PLACE_SERVICES: ReadonlySet<string> = new Set([
  'Workspace',
  'Players',
  'Lighting',
  'MaterialService',
  'ReplicatedFirst',
  'ReplicatedStorage',
  'ServerScriptService',
  'ServerStorage',
  'SoundService',
  'StarterGui',
  'StarterPack',
  'StarterPlayer',
  'Teams',
  'TextChatService',
  'LocalizationService',
  'TestService',
  'HttpService',
  'VoiceChatService',
  'ScriptEditorService',
  'Packages'
])

/**
 * Classes Studio uses for its own interface rather than for a place.
 *
 * Plugins leave these parented to the DataModel, and Studio never draws them
 * there — the plugin's own panels live under `PluginGuiService`. The MCP listing
 * reports one as a root when it lists the GUI without its parent, which is how
 * a plugin's dock widget (Rojo's, say) ended up in the tree.
 */
export const INTERFACE_CLASSES: ReadonlySet<string> = new Set([
  'DockWidgetPluginGui',
  'PluginGui',
  'PluginToolbar',
  'PluginMouse',
  // A script an editor tab is showing, which the listing reports as a root row
  // ("StarterGui.CoreUi") rather than under anything.
  'ScriptDocument'
])

/**
 * True for a class the Explorer keeps out of the tree unless asked.
 *
 * Only a class can be internal: an instance a user names `StudioService` is
 * still a `Part`, and stays visible.
 */
export function isInternalService(className: string): boolean {
  if (INTERFACE_CLASSES.has(className)) return true
  return SERVICE_CLASSES.has(className) && !PLACE_SERVICES.has(className)
}

/**
 * Drops the internal services from the tree.
 *
 * The listing nests everything under the DataModel row, so its direct children
 * are filtered against {@link PLACE_SERVICES}: the engine only allows services
 * there, plus hidden nodes with no class name at all — `FilteredSelection` and
 * friends — which Studio does not draw either. Everywhere else a row is kept
 * unless its class is an internal service, which also covers a truncated listing
 * whose roots are services.
 */
export function hideInternalServices(roots: TreeNode[], showInternal = false): TreeNode[] {
  if (showInternal) return roots

  let changed = false
  const prune = (node: TreeNode): TreeNode | null => {
    if (isInternalService(node.className)) {
      changed = true
      return null
    }
    const childrenOfDataModel = node.className === 'DataModel'
    const children = node.children
      .filter((child) =>
        childrenOfDataModel ? PLACE_SERVICES.has(child.className) : !isInternalService(child.className)
      )
      .map(prune)
      .filter((child): child is TreeNode => child !== null)

    if (
      children.length === node.children.length &&
      children.every((child, index) => child === node.children[index])
    ) {
      return node
    }
    changed = true
    return { ...node, children }
  }

  const kept = roots.map(prune).filter((node): node is TreeNode => node !== null)
  if (kept.length !== roots.length) changed = true
  // Same array when nothing matched, so React keeps the identity it already had.
  return changed ? kept : roots
}
