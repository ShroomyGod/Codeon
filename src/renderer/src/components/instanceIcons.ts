/**
 * Explorer icons for Roblox classes.
 *
 * The shapes are plain data rather than JSX so the mapping and the artwork can
 * be unit-tested without a JSX transform, and so `InstanceIcon` stays a thin
 * renderer. They are drawn inline rather than loaded from Roblox's CDN: the app
 * runs offline and the renderer's CSP allows only same-origin images.
 *
 * Each family keeps Studio's colour language — scripts blue, folders gold, parts
 * steel, lights amber — so the tree reads the same way Studio's own Explorer
 * does, and every glyph stays crisp at 14px.
 */

export type IconFamily =
  | 'script'
  | 'localscript'
  | 'modulescript'
  | 'folder'
  | 'model'
  | 'part'
  | 'mesh'
  | 'union'
  | 'light'
  | 'gui'
  | 'sound'
  | 'camera'
  | 'tool'
  | 'humanoid'
  | 'particles'
  | 'image'
  | 'animation'
  | 'terrain'
  | 'workspace'
  | 'players'
  | 'material'
  | 'network'
  | 'replicated'
  | 'storage'
  | 'scriptservice'
  | 'pack'
  | 'player'
  | 'teams'
  | 'chat'
  | 'service'
  | 'instance'

export type IconShape =
  /** A filled silhouette. */
  | { kind: 'path'; d: string; opacity?: number }
  /** A stroked outline, for sound waves and mesh edges. */
  | { kind: 'stroke'; d: string; opacity?: number; width?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; opacity?: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; opacity?: number }

export const ICON_COLORS: Record<IconFamily, string> = {
  script: '#8fb7d9',
  localscript: '#5f9fe0',
  modulescript: '#b48fe0',
  folder: '#e0b45c',
  model: '#d9a35c',
  part: '#8fa3b4',
  mesh: '#5fc0ae',
  union: '#9fb0bd',
  light: '#ecc95c',
  gui: '#6fb0e8',
  sound: '#e0806f',
  camera: '#6f9ad9',
  tool: '#bdb3a4',
  humanoid: '#dd946f',
  particles: '#c79ce6',
  image: '#79c95c',
  animation: '#e0a85c',
  terrain: '#93a86f',
  workspace: '#4ec9b0',
  players: '#6fbf73',
  material: '#e08a4a',
  network: '#569cd6',
  replicated: '#6fa8dc',
  storage: '#5fbf9f',
  scriptservice: '#8ec07c',
  pack: '#dcdcaa',
  player: '#e8c05c',
  teams: '#c9b46a',
  chat: '#7fb8e8',
  service: '#9d9d9d',
  instance: '#9c9086'
}

/** The page silhouette shared by every script type. */
const PAGE: IconShape[] = [
  {
    kind: 'path',
    d: 'M4 1.6h5.2l3.3 3.3V14a.6.6 0 0 1-.6.6H4a.6.6 0 0 1-.6-.6V2.2A.6.6 0 0 1 4 1.6Z',
    opacity: 0.55
  },
  { kind: 'path', d: 'M9.2 1.6 12.5 4.9H9.8a.6.6 0 0 1-.6-.6V1.6Z', opacity: 0.35 }
]

/** The shared isometric part shape: top face bright, sides stepped down. */
const CUBE: IconShape[] = [
  { kind: 'path', d: 'M8 1.4 14 4.7 8 8 2 4.7Z', opacity: 0.95 },
  { kind: 'path', d: 'M2 4.7 8 8v6.6l-6-3.3Z', opacity: 0.6 },
  { kind: 'path', d: 'M14 4.7 8 8v6.6l6-3.3Z', opacity: 0.35 }
]

export const ICON_SHAPES: Record<IconFamily, IconShape[]> = {
  script: [
    ...PAGE,
    { kind: 'path', d: 'M5.5 6.5h5v1h-5zM5.5 8.7h5v1h-5zM5.5 10.9h3.2v1H5.5z' }
  ],
  localscript: [
    ...PAGE,
    { kind: 'rect', x: 5.4, y: 6.4, w: 5.2, h: 4.2, opacity: 0.35 },
    { kind: 'path', d: 'M8 5.6 10.8 7.1 8 8.6 5.2 7.1Z' },
    { kind: 'rect', x: 6.4, y: 11.6, w: 3.2, h: 1 }
  ],
  modulescript: [
    ...PAGE,
    { kind: 'path', d: 'M8 5.5 11 7.2 8 8.9 5 7.2Z' },
    { kind: 'path', d: 'M5 7.2 8 8.9v3.4L5 10.6Z', opacity: 0.6 },
    { kind: 'path', d: 'M11 7.2 8 8.9v3.4l3-1.7Z', opacity: 0.35 }
  ],
  folder: [
    {
      kind: 'path',
      d: 'M2 4.9a2 2 0 0 1 2-2h2.4l1.4 1.6H12a2 2 0 0 1 2 2v4.3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z'
    }
  ],
  model: [
    { kind: 'path', d: 'M9.6 1.8 14.2 4.4 9.6 7 5 4.4Z', opacity: 0.8 },
    { kind: 'path', d: 'M5 4.4 9.6 7v5.2L5 9.6Z', opacity: 0.5 },
    { kind: 'path', d: 'M14.2 4.4 9.6 7v5.2l4.6-2.6Z', opacity: 0.3 },
    { kind: 'path', d: 'M6.4 8.6 4 9.9v3.2l2.4-1.3Z', opacity: 0.9 }
  ],
  part: CUBE,
  mesh: [
    ...CUBE,
    { kind: 'path', d: 'M8 1.4 11 3 8 4.6 5 3Z', opacity: 0.5 },
    { kind: 'stroke', d: 'M2 4.7 8 8l6-3.3', opacity: 0.5, width: 0.7 }
  ],
  union: [
    ...CUBE,
    { kind: 'rect', x: 5.4, y: 9.6, w: 5.2, h: 1.4, opacity: 0.9 },
    { kind: 'rect', x: 9.3, y: 7.6, w: 3, h: 1.2, opacity: 0.7 }
  ],
  light: [
    {
      kind: 'path',
      d: 'M8 1.5a4.3 4.3 0 0 0-2.5 7.8c.5.4.8 1 .8 1.6h3.4c0-.6.3-1.2.8-1.6A4.3 4.3 0 0 0 8 1.5Z'
    },
    { kind: 'path', d: 'M6.3 11.9h3.4v.6a1.7 1.7 0 0 1-3.4 0Z', opacity: 0.7 }
  ],
  gui: [
    {
      kind: 'path',
      d: 'M1.6 3.2h12.8a.6.6 0 0 1 .6.6v8.4a.6.6 0 0 1-.6.6H1.6a.6.6 0 0 1-.6-.6V3.8a.6.6 0 0 1 .6-.6Z',
      opacity: 0.4
    },
    { kind: 'path', d: 'M1 4.7h14v1.4H1z', opacity: 0.85 },
    { kind: 'path', d: 'M3.2 7.6h6v1H3.2zM3.2 9.6h4v1h-4z', opacity: 0.8 },
    { kind: 'circle', cx: 12.4, cy: 5.4, r: 0.9 }
  ],
  sound: [
    {
      kind: 'path',
      d: 'M2.8 6.1h2.3l3.3-2.7v9.2L5.1 9.9H2.8a.7.7 0 0 1-.7-.7V6.8a.7.7 0 0 1 .7-.7Z'
    },
    { kind: 'stroke', d: 'M10.4 5.6a4.2 4.2 0 0 1 0 4.8M12.2 4.1a6.4 6.4 0 0 1 0 7.8', opacity: 0.7, width: 1.1 }
  ],
  camera: [
    {
      kind: 'path',
      d: 'M1.4 5.4h3.1l.9-1.5h5.2l.9 1.5h3.1a.6.6 0 0 1 .6.6v5.4a.6.6 0 0 1-.6.6H1.4a.6.6 0 0 1-.6-.6V6a.6.6 0 0 1 .6-.6Z'
    },
    { kind: 'circle', cx: 8, cy: 8.7, r: 2.2, opacity: 0.35 }
  ],
  tool: [
    {
      kind: 'path',
      d: 'M10.9 1.7a3.7 3.7 0 0 0-3.2 5.5L2.3 12.6l1.1 1.1 5.4-5.4a3.7 3.7 0 0 0 4.9-4.7l-2 2-1.5-1.5Z'
    }
  ],
  humanoid: [
    { kind: 'circle', cx: 8, cy: 4.1, r: 2.3 },
    { kind: 'path', d: 'M3.4 14.4c0-2.5 2.1-4.5 4.6-4.5s4.6 2 4.6 4.5Z', opacity: 0.8 }
  ],
  particles: [
    { kind: 'path', d: 'M6.1 2 7.2 5 10.2 6.1 7.2 7.2 6.1 10.2 5 7.2 2 6.1 5 5Z' },
    { kind: 'path', d: 'M11.4 8.6 12 10.4 13.8 11 12 11.6 11.4 13.4 10.8 11.6 9 11 10.8 10.4Z', opacity: 0.8 }
  ],
  image: [
    {
      kind: 'path',
      d: 'M1.8 3.2h12.4a.6.6 0 0 1 .6.6v8.4a.6.6 0 0 1-.6.6H1.8a.6.6 0 0 1-.6-.6V3.8a.6.6 0 0 1 .6-.6Z',
      opacity: 0.4
    },
    { kind: 'path', d: 'M2.4 11.8 6 7.4l2.4 2.9 2.1-1.8 3.1 3.3Z', opacity: 0.9 },
    { kind: 'circle', cx: 5.3, cy: 5.9, r: 1.2 }
  ],
  animation: [
    { kind: 'path', d: 'M8 1.7 10.3 4 8 6.3 5.7 4Z', opacity: 0.85 },
    { kind: 'path', d: 'M2.6 9.7 4.9 12 2.6 14.3.3 12Z', opacity: 0.6 },
    { kind: 'path', d: 'M8 9.7 10.3 12 8 14.3 5.7 12Z', opacity: 0.6 },
    { kind: 'path', d: 'M13.4 9.7 15.7 12l-2.3 2.3L11.1 12Z', opacity: 0.6 },
    { kind: 'path', d: 'M4.6 4h4.2v1H4.6z', opacity: 0.7 },
    { kind: 'circle', cx: 10.6, cy: 4.5, r: 1.3 }
  ],
  terrain: [
    { kind: 'path', d: 'M1.2 13.4V9.2l3.1-2.1 3 2.4 2.6-3.4 4.9 3.6v3.7Z' },
    { kind: 'path', d: 'M1.2 13.4h13.6v1.2H1.2z', opacity: 0.5 }
  ],
  workspace: [
    { kind: 'circle', cx: 8, cy: 8, r: 6.2, opacity: 0.4 },
    { kind: 'rect', x: 1.6, y: 7.4, w: 12.8, h: 1.2, opacity: 0.95 },
    { kind: 'stroke', d: 'M8 1.9c-2.4 2.6-2.4 9.6 0 12.2M8 1.9c2.4 2.6 2.4 9.6 0 12.2', opacity: 0.75, width: 0.9 }
  ],
  players: [
    { kind: 'circle', cx: 5.6, cy: 4.8, r: 2.1 },
    { kind: 'path', d: 'M1.5 13.6c0-2.3 1.8-4.1 4.1-4.1s4.1 1.8 4.1 4.1Z' },
    { kind: 'circle', cx: 11.6, cy: 5.8, r: 1.5, opacity: 0.7 },
    { kind: 'path', d: 'M9.9 13.6c0-1.5.7-2.8 1.8-3.5v3.5Z', opacity: 0.7 }
  ],
  material: [
    { kind: 'circle', cx: 8, cy: 8, r: 6.1, opacity: 0.9 },
    { kind: 'circle', cx: 8, cy: 8, r: 3.4, opacity: 0.3 },
    { kind: 'circle', cx: 5.9, cy: 5.9, r: 1.1, opacity: 0.6 }
  ],
  network: [
    { kind: 'stroke', d: 'M4.2 4.7 11.8 4.7M4.2 4.7 8 11.7M11.8 4.7 8 11.7', opacity: 0.5, width: 0.9 },
    { kind: 'circle', cx: 3.6, cy: 4.2, r: 1.5 },
    { kind: 'circle', cx: 12.4, cy: 4.2, r: 1.5, opacity: 0.8 },
    { kind: 'circle', cx: 8, cy: 12.4, r: 1.5, opacity: 0.6 }
  ],
  replicated: [
    { kind: 'rect', x: 2, y: 2.4, w: 9.4, h: 6.2, opacity: 0.4 },
    { kind: 'rect', x: 4.6, y: 6.8, w: 9.4, h: 6.2 },
    { kind: 'rect', x: 6.4, y: 8.6, w: 5.8, h: 1.1, opacity: 0.35 }
  ],
  storage: [
    { kind: 'rect', x: 2, y: 3.8, w: 12, h: 8.6, opacity: 0.45 },
    { kind: 'rect', x: 2, y: 3.8, w: 12, h: 3 },
    { kind: 'rect', x: 6.6, y: 8.4, w: 2.8, h: 1.6 },
    { kind: 'rect', x: 5.4, y: 11, w: 5.2, h: 1.4, opacity: 0.6 }
  ],
  scriptservice: [
    ...PAGE,
    { kind: 'path', d: 'M5.5 6.5h5v1h-5zM5.5 8.7h5v1h-5zM5.5 10.9h3.2v1H5.5z' },
    { kind: 'circle', cx: 12.6, cy: 12.6, r: 2.4, opacity: 0.9 }
  ],
  pack: [
    { kind: 'stroke', d: 'M5.2 4.6a2.8 2.8 0 0 1 5.6 0', opacity: 0.8, width: 1 },
    { kind: 'rect', x: 3.2, y: 4.6, w: 9.6, h: 8.8 },
    { kind: 'rect', x: 6.2, y: 8.2, w: 3.6, h: 3.4, opacity: 0.35 }
  ],
  player: [
    { kind: 'circle', cx: 6.2, cy: 4.4, r: 2.2 },
    { kind: 'path', d: 'M1.8 13.8c0-2.4 2-4.4 4.4-4.4s4.4 2 4.4 4.4Z', opacity: 0.9 },
    { kind: 'path', d: 'M11.2 8.6 14.6 10.7 11.2 12.8Z' }
  ],
  teams: [
    { kind: 'circle', cx: 4.2, cy: 4.6, r: 1.7, opacity: 0.7 },
    { kind: 'circle', cx: 8, cy: 3.7, r: 1.9 },
    { kind: 'circle', cx: 11.8, cy: 4.6, r: 1.7, opacity: 0.7 },
    { kind: 'path', d: 'M1.2 13.6c0-1.7 1.4-3 3-3h7.6c1.7 0 3 1.3 3 3Z', opacity: 0.85 }
  ],
  chat: [
    {
      kind: 'path',
      d: 'M2.4 3.4h11.2a.8.8 0 0 1 .8.8v5.8a.8.8 0 0 1-.8.8H7.8L4.4 14V10.8H2.4a.8.8 0 0 1-.8-.8V4.2a.8.8 0 0 1 .8-.8Z'
    },
    { kind: 'rect', x: 4.4, y: 6, w: 1.4, h: 1.6, opacity: 0.3 },
    { kind: 'rect', x: 7.3, y: 6, w: 1.4, h: 1.6, opacity: 0.3 },
    { kind: 'rect', x: 10.2, y: 6, w: 1.4, h: 1.6, opacity: 0.3 }
  ],
  service: [
    { kind: 'circle', cx: 8, cy: 8, r: 3.2 },
    { kind: 'circle', cx: 8, cy: 8, r: 1.2, opacity: 0.3 },
    { kind: 'rect', x: 7.2, y: 1.4, w: 1.6, h: 3, opacity: 0.8 },
    { kind: 'rect', x: 7.2, y: 11.6, w: 1.6, h: 3, opacity: 0.8 },
    { kind: 'rect', x: 1.4, y: 7.2, w: 3, h: 1.6, opacity: 0.8 },
    { kind: 'rect', x: 11.6, y: 7.2, w: 3, h: 1.6, opacity: 0.8 }
  ],
  instance: [
    { kind: 'rect', x: 3.2, y: 3.2, w: 9.6, h: 9.6, opacity: 0.45 },
    { kind: 'rect', x: 6, y: 6, w: 4, h: 4 }
  ]
}

const SCRIPT_CLASSES: Record<string, IconFamily> = {
  Script: 'script',
  LocalScript: 'localscript',
  ModuleScript: 'modulescript'
}

/** Roblox's DataModel services and other well-known containers. */
const SERVICE_FAMILIES: Record<string, IconFamily> = {
  Workspace: 'workspace',
  Players: 'players',
  Teams: 'teams',
  Lighting: 'light',
  MaterialService: 'material',
  NetworkClient: 'network',
  NetworkServer: 'network',
  NetworkReplicator: 'network',
  ReplicatedFirst: 'replicated',
  ReplicatedStorage: 'replicated',
  ServerScriptService: 'scriptservice',
  StarterPlayerScripts: 'scriptservice',
  StarterCharacterScripts: 'scriptservice',
  ServerStorage: 'storage',
  StarterGui: 'gui',
  StarterPack: 'pack',
  StarterPlayer: 'player',
  SoundService: 'sound',
  TextChatService: 'chat',
  Chat: 'chat',
  LocalizationService: 'chat'
}

/**
 * Maps a class name onto the icon family that represents it.
 *
 * Order matters: the specific script classes and the mesh/union parts are
 * matched before the broad `Part` and `Gui` suffixes so they are not shadowed.
 */
export function familyFor(className: string): IconFamily {
  const exact = SCRIPT_CLASSES[className]
  if (exact) return exact

  // Services get their own icons, which is what makes the top of the tree look
  // like Studio's Explorer. Checked first so `StarterGui` does not fall into the
  // generic GUI rule below.
  const service = SERVICE_FAMILIES[className]
  if (service) return service
  if (className.endsWith('Service')) return 'service'

  if (className === 'Folder' || className === 'Configuration') return 'folder'
  if (className === 'Model' || className === 'Actor' || className === 'WorldModel') return 'model'
  if (className === 'MeshPart' || className === 'SpecialMesh' || className === 'FileMesh') return 'mesh'
  if (
    className === 'UnionOperation' ||
    className === 'IntersectOperation' ||
    className === 'NegateOperation'
  ) {
    return 'union'
  }
  if (className === 'Terrain' || className === 'TerrainRegion') return 'terrain'
  if (className === 'ParticleEmitter') return 'particles'
  if (className.endsWith('Light')) return 'light'
  if (className === 'Sound' || className === 'SoundGroup') return 'sound'
  if (className === 'Camera') return 'camera'
  if (className === 'Tool' || className === 'HopperBin' || className === 'Backpack') return 'tool'
  if (className === 'Humanoid' || className === 'HumanoidDescription' || className === 'Animator') {
    return 'humanoid'
  }
  if (
    className === 'Animation' ||
    className === 'KeyframeSequence' ||
    className === 'AnimationController'
  ) {
    return 'animation'
  }
  if (
    className === 'Decal' ||
    className === 'Texture' ||
    className === 'SurfaceAppearance' ||
    className === 'ImageHandleAdornment'
  ) {
    return 'image'
  }
  if (className.endsWith('ImageLabel') || className.endsWith('ImageButton')) return 'image'
  if (className.startsWith('UIGrid') || className.startsWith('UIList')) return 'gui'
  if (
    className.endsWith('Gui') ||
    className === 'Frame' ||
    className === 'ScrollingFrame' ||
    className === 'ViewportFrame' ||
    className === 'CanvasGroup' ||
    className === 'TextBox' ||
    className.endsWith('Label') ||
    className.endsWith('Button') ||
    className === 'UICorner' ||
    className === 'UIStroke' ||
    className === 'UIPadding'
  ) {
    return 'gui'
  }
  if (className.endsWith('Part') || className === 'Seat' || className === 'SpawnLocation') return 'part'

  return 'instance'
}
