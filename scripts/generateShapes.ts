#!/usr/bin/env tsx
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import OpenAI from 'openai'

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/generated/shapes.ts')
const SHAPE_COUNT = 3
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini'

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in environment. Set it before running the generator.')
  }

  const client = new OpenAI({ apiKey })

  const responseParams = {
    model: MODEL,
    reasoning: { effort: 'medium' },
    input: buildPrompt(),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'GeneratedShapesPayload',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['shapes'],
          properties: {
            shapes: {
              type: 'array',
              minItems: SHAPE_COUNT,
              maxItems: SHAPE_COUNT,
              items: shapeSchema,
            },
          },
        },
      },
    },
  } as any

  const response = await client.responses.create(responseParams)

  const payloadText = response.output_text
  if (!payloadText) {
    throw new Error('OpenAI response did not contain any text output')
  }

  let parsed: { shapes: ShapePayload[] }
  try {
    parsed = JSON.parse(payloadText) as { shapes: ShapePayload[] }
  } catch (error) {
    throw new Error(`Failed to parse JSON response from OpenAI: ${(error as Error).message}`)
  }

  const fileContent = buildModule(parsed.shapes)
  await fs.writeFile(OUTPUT_PATH, fileContent, 'utf8')
  process.stdout.write(`Generated ${parsed.shapes.length} shapes into ${path.relative(process.cwd(), OUTPUT_PATH)}\n`)
}

const primitiveKinds = ['sphere', 'box', 'cone', 'cylinder', 'torus'] as const

type PrimitiveKind = (typeof primitiveKinds)[number]

type PrimitivePayload = {
  kind: PrimitiveKind
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  args?: number[]
}

type ShapePayload = {
  id: `shape-${number}`
  label: string
  description: string
  primitives: PrimitivePayload[]
}

const numberTripleSchema = {
  type: 'array',
  minItems: 3,
  maxItems: 3,
  items: { type: 'number', minimum: -2.5, maximum: 2.5 },
} as const

const primitiveSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: primitiveKinds as unknown as string[] },
    position: numberTripleSchema,
    rotation: numberTripleSchema,
    scale: {
      oneOf: [
        { type: 'number', minimum: 0.2, maximum: 2.5 },
        {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number', minimum: 0.2, maximum: 2.5 },
        },
      ],
    },
    args: {
      type: 'array',
      minItems: 0,
      maxItems: 4,
      items: { type: 'number', minimum: 0.05, maximum: 6 },
    },
  },
} as const

const shapeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'description', 'primitives'],
  properties: {
    id: { type: 'string', pattern: '^shape-[1-9][0-9]*$' },
    label: { type: 'string', minLength: 3, maxLength: 40 },
    description: { type: 'string', minLength: 16, maxLength: 160 },
    primitives: {
      type: 'array',
      minItems: 4,
      maxItems: 9,
      items: primitiveSchema,
    },
  },
} as const

function buildPrompt(): string {
  return `Design ${SHAPE_COUNT} imaginative silhouettes for a three-lane shadow racing game.
- Output JSON only and follow the provided schema.
- Use creative, short labels and vivid descriptions.
- For each shape build 4-9 primitives from the allowed set: ${primitiveKinds.join(', ')}.
- Keep coordinates roughly within [-1.6, 1.6] so the models stay centered after normalization.
- Use rotations in degrees.
- Vary scale per primitive while avoiding paper-thin results.
- Ensure every shape looks distinct and balanced when viewed from the front.`
}

function buildModule(shapes: ShapePayload[]): string {
  const normalized = normalizeShapes(shapes)
  const header = [
    "export type GeneratedPrimitiveKind = 'sphere' | 'box' | 'cone' | 'cylinder' | 'torus'",
    '',
    'export type GeneratedPrimitive = {',
    '  kind: GeneratedPrimitiveKind',
    '  position?: [number, number, number]',
    '  rotation?: [number, number, number]',
    '  scale?: number | [number, number, number]',
    '  args?: number[]',
    '}',
    '',
    'export type GeneratedShapeDefinition = {',
    '  id: `shape-${number}`',
    '  label: string',
    '  description: string',
    '  primitives: GeneratedPrimitive[]',
    '}',
    '',
  ].join('\n')

  const body = JSON.stringify(normalized, numberReducer, 2)
  return `${header}\nexport const GENERATED_SHAPES: GeneratedShapeDefinition[] = ${body} as const\n`
}

function normalizeShapes(shapes: ShapePayload[]): ShapePayload[] {
  const seen = new Set<string>()
  return shapes.map((shape, index) => {
    const fallbackId = `shape-${index + 1}` as const
    let id = shape.id ?? fallbackId
    if (seen.has(id)) {
      id = fallbackId
    }
    seen.add(id)

    return {
      id,
      label: shape.label.trim(),
      description: shape.description.trim(),
      primitives: shape.primitives.map(normalizePrimitive).slice(0, 9),
    }
  })
}

function normalizePrimitive(primitive: PrimitivePayload): PrimitivePayload {
  return {
    kind: primitive.kind,
    position: primitive.position ? normalizeTuple(primitive.position) : undefined,
    rotation: primitive.rotation ? normalizeTuple(primitive.rotation) : undefined,
    scale: normalizeScale(primitive.scale),
    args: primitive.args ? primitive.args.map(normalizeNumber) : undefined,
  }
}

function normalizeTuple(tuple: [number, number, number]): [number, number, number] {
  return [normalizeNumber(tuple[0]), normalizeNumber(tuple[1]), normalizeNumber(tuple[2])]
}

function normalizeScale(scale: PrimitivePayload['scale']): PrimitivePayload['scale'] {
  if (scale == null) {
    return undefined
  }
  if (typeof scale === 'number') {
    return normalizeNumber(scale)
  }
  return [normalizeNumber(scale[0]), normalizeNumber(scale[1]), normalizeNumber(scale[2])]
}

function normalizeNumber(value: number): number {
  return Number(value.toFixed(4))
}

function numberReducer(_key: string, value: unknown) {
  if (typeof value === 'number') {
    return normalizeNumber(value)
  }
  return value
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
