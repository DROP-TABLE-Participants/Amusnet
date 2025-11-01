import type { GeneratedShapeDefinition } from '../generated/shapes'
import type { ShapeId } from '../shared/shapes'

export const SLOT_DECOY_SHAPES: GeneratedShapeDefinition[] = [
  {
    id: 'shape-decoy-orbital-ring',
    label: 'Orbital Ring',
    description: 'Spinner decoy shape built from torus rings and a central sphere.',
    primitives: [
      {
        kind: 'torus',
        args: [1, 0.16, 28, 46],
        rotation: [90, 0, 0],
      },
      {
        kind: 'torus',
        args: [0.7, 0.12, 28, 46],
        rotation: [0, 90, 0],
      },
      {
        kind: 'sphere',
        args: [0.48, 32, 32],
      },
      {
        kind: 'cylinder',
        args: [0.14, 0.14, 2, 28],
        rotation: [0, 90, 0],
      },
      {
        kind: 'cylinder',
        args: [0.14, 0.14, 2, 28],
        rotation: [90, 0, 0],
      },
    ],
  },
  {
    id: 'shape-decoy-astral-spire',
    label: 'Astral Spire',
    description: 'Spinner decoy shape composed of stacked cones and cylinders.',
    primitives: [
      {
        kind: 'cylinder',
        args: [0.35, 0.35, 1.4, 32],
        position: [0, -0.2, 0],
      },
      {
        kind: 'cone',
        args: [0.6, 1.6, 32],
        rotation: [0, 0, 0],
        position: [0, 0.65, 0],
      },
      {
        kind: 'sphere',
        args: [0.4, 32, 32],
        position: [0, 1.4, 0],
      },
      {
        kind: 'cylinder',
        args: [0.25, 0.25, 1.6, 24],
        rotation: [0, 0, 90],
        position: [0, 0.35, 0],
      },
      {
        kind: 'cylinder',
        args: [0.25, 0.25, 1.6, 24],
        rotation: [90, 0, 0],
        position: [0, 0.35, 0],
      },
    ],
  },
  {
    id: 'shape-decoy-nebula-fragment',
    label: 'Nebula Fragment',
    description: 'Spinner decoy shape featuring offset spheres and skewed boxes.',
    primitives: [
      {
        kind: 'sphere',
        args: [0.65, 32, 32],
        position: [-0.4, 0.2, 0.3],
      },
      {
        kind: 'sphere',
        args: [0.45, 24, 24],
        position: [0.6, -0.1, -0.2],
      },
      {
        kind: 'box',
        args: [0.4, 1.4, 0.4],
        rotation: [0, 0, 35],
        position: [0.2, 0.65, -0.1],
      },
      {
        kind: 'box',
        args: [0.3, 0.9, 0.3],
        rotation: [0, 0, -35],
        position: [-0.5, -0.55, 0.1],
      },
      {
        kind: 'torus',
        args: [0.75, 0.12, 24, 36],
        rotation: [90, 0, 0],
      },
    ],
  },
  {
    id: 'shape-decoy-comet-array',
    label: 'Comet Array',
    description: 'Spinner decoy shape with sweeping cones and mirrored cylinders.',
    primitives: [
      {
        kind: 'cone',
        args: [0.38, 1.3, 28],
        rotation: [0, 0, -25],
        position: [-0.6, -0.2, 0],
      },
      {
        kind: 'cone',
        args: [0.38, 1.3, 28],
        rotation: [0, 0, 25],
        position: [0.6, 0.1, 0],
      },
      {
        kind: 'cylinder',
        args: [0.2, 0.35, 1.1, 32],
        rotation: [0, 0, 90],
        position: [0, 0.7, 0],
      },
      {
        kind: 'cylinder',
        args: [0.2, 0.35, 1.1, 32],
        rotation: [0, 0, 90],
        position: [0, -0.7, 0],
      },
      {
        kind: 'sphere',
        args: [0.35, 24, 24],
        position: [0, 0, 0],
      },
    ],
  },
]

export const SLOT_DECOY_SHAPE_IDS: ShapeId[] = SLOT_DECOY_SHAPES.map((shape) => shape.id as ShapeId)
