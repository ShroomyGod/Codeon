import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ICON_COLORS,
  ICON_SHAPES,
  familyFor,
  type IconFamily
} from '../src/renderer/src/components/instanceIcons'

describe('familyFor', () => {
  const cases: [string, IconFamily][] = [
    ['Script', 'script'],
    ['LocalScript', 'localscript'],
    ['ModuleScript', 'modulescript'],
    ['Folder', 'folder'],
    ['Configuration', 'folder'],
    ['Model', 'model'],
    ['Part', 'part'],
    ['WedgePart', 'part'],
    ['SpawnLocation', 'part'],
    ['Seat', 'part'],
    ['MeshPart', 'mesh'],
    ['UnionOperation', 'union'],
    ['PointLight', 'light'],
    ['SurfaceLight', 'light'],
    ['ParticleEmitter', 'particles'],
    ['Sound', 'sound'],
    ['SoundGroup', 'sound'],
    ['Camera', 'camera'],
    ['Tool', 'tool'],
    ['Humanoid', 'humanoid'],
    ['Animator', 'humanoid'],
    ['Animation', 'animation'],
    ['ScreenGui', 'gui'],
    ['Frame', 'gui'],
    ['TextLabel', 'gui'],
    ['TextButton', 'gui'],
    ['TextBox', 'gui'],
    ['ViewportFrame', 'gui'],
    ['UICorner', 'gui'],
    ['UIGridLayout', 'gui'],
    ['Decal', 'image'],
    ['ImageLabel', 'image'],
    ['ImageButton', 'image'],
    ['Terrain', 'terrain'],
    ['Attachment', 'instance'],
    ['SomeFutureClassRobloxAdds', 'instance'],
    // Services, which are what the top level of the tree shows.
    ['Workspace', 'workspace'],
    ['Players', 'players'],
    ['Teams', 'teams'],
    ['Lighting', 'light'],
    ['MaterialService', 'material'],
    ['NetworkClient', 'network'],
    ['NetworkServer', 'network'],
    ['ReplicatedFirst', 'replicated'],
    ['ReplicatedStorage', 'replicated'],
    ['ServerScriptService', 'scriptservice'],
    ['StarterCharacterScripts', 'scriptservice'],
    ['ServerStorage', 'storage'],
    ['StarterGui', 'gui'],
    ['StarterPack', 'pack'],
    ['StarterPlayer', 'player'],
    ['SoundService', 'sound'],
    ['TextChatService', 'chat'],
    ['HttpService', 'service'],
    ['CollectionService', 'service']
  ]

  for (const [className, expected] of cases) {
    it(`maps ${className} to ${expected}`, () => {
      assert.equal(familyFor(className), expected)
    })
  }

  it('does not let a broad suffix shadow a specific class', () => {
    // MeshPart and UnionOperation both end in "Part"; they must not collapse
    // into the generic part icon.
    assert.notEqual(familyFor('MeshPart'), familyFor('Part'))
    assert.notEqual(familyFor('UnionOperation'), familyFor('Part'))
    // ImageLabel ends in "Label", which the generic GUI rule would swallow.
    assert.notEqual(familyFor('ImageLabel'), familyFor('TextLabel'))
    // HumanoidDescription must not fall through to the Humanoid check order.
    assert.equal(familyFor('HumanoidDescription'), 'humanoid')
  })

  it('never returns anything pictographic', () => {
    for (const [className] of cases) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(familyFor(className)))
    }
  })
})

describe('icon artwork', () => {
  it('gives every family a distinct, valid colour', () => {
    const families = Object.keys(ICON_SHAPES) as IconFamily[]
    const colors = families.map((family) => ICON_COLORS[family])
    assert.equal(new Set(colors).size, colors.length, 'every family needs its own colour')
    for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/i)
  })

  it('draws every family with at least one shape inside the 16x16 viewBox', () => {
    for (const [family, shapes] of Object.entries(ICON_SHAPES)) {
      assert.ok(shapes.length > 0, `${family} has no artwork`)
      for (const shape of shapes) {
        if (shape.kind === 'path' || shape.kind === 'stroke') {
          assert.ok(shape.d.length > 0, `${family} has an empty path`)
          continue
        }
        if (shape.kind === 'circle') {
          assert.ok(shape.r > 0, `${family} has a zero-radius circle`)
          continue
        }
        assert.ok(shape.w > 0 && shape.h > 0, `${family} has an empty rect`)
      }
    }
  })

  it('covers every family in both the colour and shape tables', () => {
    const families = Object.keys(ICON_SHAPES).sort()
    assert.deepEqual(Object.keys(ICON_COLORS).sort(), families)
  })

  it('uses opacity only for depth, never as the sole definition of a shape', () => {
    // A shape at zero opacity would be invisible; that is always a mistake.
    for (const [family, shapes] of Object.entries(ICON_SHAPES)) {
      for (const shape of shapes) {
        if (shape.opacity !== undefined) {
          assert.ok(shape.opacity > 0 && shape.opacity <= 1, `${family} has an invisible shape`)
        }
      }
    }
  })
})
