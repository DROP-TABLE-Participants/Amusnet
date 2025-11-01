export type GeneratedPrimitiveKind = 'sphere' | 'box' | 'cone' | 'cylinder' | 'torus'

export type GeneratedPrimitive = {
  kind: GeneratedPrimitiveKind
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  args?: number[]
}

export type GeneratedShapeDefinition = {
  id: `shape-${number}`
  label: string
  description: string
  primitives: GeneratedPrimitive[]
}

export const GENERATED_SHAPES: GeneratedShapeDefinition[] = [
  {
    id: 'shape-1',
    label: 'Aurora Bloom',
    description: 'A clustering of soft orbs and beams that feel like a frozen spark in mid-air.',
    primitives: [
      { kind: 'sphere', position: [0, 0.4, 0], scale: 0.9 },
      { kind: 'sphere', position: [-0.85, -0.3, 0.35], scale: 0.55 },
      { kind: 'sphere', position: [0.95, -0.25, -0.25], scale: 0.45 },
      { kind: 'cylinder', position: [0.1, 0.9, 0], rotation: [90, 0, 30], scale: [0.2, 1.2, 0.2] },
      { kind: 'cylinder', position: [-0.35, -0.9, 0], rotation: [-15, 0, 60], scale: [0.16, 1.1, 0.16] },
    ],
  },
  {
    id: 'shape-2',
    label: 'Comet Twist',
    description: 'Angular fins anchored to a compact core with a sense of motion.',
    primitives: [
      { kind: 'box', position: [0, 0, 0], scale: [1.2, 0.6, 0.6] },
      { kind: 'box', position: [0, 0.65, 0], rotation: [0, 0, 35], scale: [0.4, 1.4, 0.4] },
      { kind: 'cone', position: [0, -0.7, 0], rotation: [0, 0, 180], scale: [0.6, 1.2, 0.6] },
      { kind: 'cylinder', position: [0.95, 0.05, 0], rotation: [0, 0, 30], scale: [0.15, 1.4, 0.15] },
      { kind: 'cylinder', position: [-0.95, -0.05, 0], rotation: [0, 0, -30], scale: [0.15, 1.4, 0.15] },
    ],
  },
  {
    id: 'shape-3',
    label: 'Helix Drift',
    description: 'Stacked rings and tapers swirling around a vertical gyroscope.',
    primitives: [
      { kind: 'cylinder', position: [0, 0.1, 0], scale: [0.4, 1.8, 0.4] },
      { kind: 'torus', position: [0, 1, 0], rotation: [90, 0, 0], scale: [0.9, 0.9, 0.9], args: [0.72, 0.14, 32, 64] },
      { kind: 'torus', position: [0, -0.75, 0], rotation: [90, 0, 0], scale: [0.55, 0.55, 0.55], args: [0.46, 0.12, 28, 48] },
      { kind: 'cone', position: [0, 1.45, 0], scale: [0.35, 0.8, 0.35] },
      { kind: 'cone', position: [0, -1.3, 0], rotation: [180, 0, 0], scale: [0.45, 0.9, 0.45] },
    ],
  },
] as const
