import OpenAI from 'openai'
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import { customAlphabet } from 'nanoid'
import type { GeneratedShapeDefinition, GeneratedPrimitive } from '../src/generated/shapes'
import { PRIMITIVE_KINDS, SYSTEM_PROMPT, buildShapePrompt } from './shapePrompt'

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
const fallbackIdGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10)

export async function generateShapeBatch(count: number): Promise<GeneratedShapeDefinition[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || count <= 0) {
    return []
  }

  const client = new OpenAI({ apiKey })
  const responseParams = {
    model: MODEL,
   // reasoning: { effort: 'low' },
    input: [
      { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
      { role: 'user', content: [{ type: 'input_text', text: buildShapePrompt(count) }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'GeneratedShapesPayload',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['shapes'],
          properties: {
            shapes: {
              type: 'array',
              minItems: count,
              maxItems: count,
              items: shapeSchema,
            },
          },
        },
      },
    },
  }

  const response = await client.responses.create(responseParams as unknown as ResponseCreateParamsNonStreaming)

  const payloadText = response.output_text
  if (!payloadText) {
    return []
  }

  let parsed: ShapePayloadResponse
  try {
    parsed = JSON.parse(payloadText) as ShapePayloadResponse
  } catch {
    return []
  }

  return normalizeShapes(parsed.shapes, count)
}

type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number]

type PrimitivePayload = {
  kind: PrimitiveKind
  position: [number, number, number] | null
  rotation: [number, number, number] | null
  scale: number | [number, number, number] | null
  args: number[] | null
}

type ShapePayload = {
  id: string | null
  label: string
  description: string
  primitives: PrimitivePayload[]
}

type ShapePayloadResponse = {
  shapes: ShapePayload[]
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
  required: ['kind', 'position', 'rotation', 'scale', 'args'],
  properties: {
    kind: { type: 'string', enum: PRIMITIVE_KINDS as unknown as string[] },
    position: { anyOf: [numberTripleSchema, { type: 'null' }] },
    rotation: { anyOf: [numberTripleSchema, { type: 'null' }] },
    scale: {
      anyOf: [
        { type: 'number', minimum: 0.2, maximum: 2.5 },
        {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number', minimum: 0.2, maximum: 2.5 },
        },
        { type: 'null' },
      ],
    },
    args: {
      anyOf: [
        {
          type: 'array',
          minItems: 0,
          maxItems: 4,
          items: { type: 'number', minimum: 0.05, maximum: 6 },
        },
        { type: 'null' },
      ],
    },
  },
} as const

const shapeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'description', 'primitives'],
  properties: {
    id: {
      anyOf: [
        { type: 'string', pattern: '^shape-[0-9A-Za-z-]{4,}$' },
        { type: 'null' },
      ],
    },
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

function normalizeShapes(shapes: ShapePayload[], count: number): GeneratedShapeDefinition[] {
  const seen = new Set<string>()
  return shapes.slice(0, count).map((shape, index) => {
    const fallbackId = `shape-${fallbackIdGenerator()}` as GeneratedShapeDefinition['id']
    const candidate = typeof shape.id === 'string' ? shape.id.trim() : ''
    let id = /^shape-[0-9A-Za-z-]{4,}$/.test(candidate)
      ? (candidate as GeneratedShapeDefinition['id'])
      : fallbackId
    if (seen.has(id)) {
      id = fallbackId
    }
    seen.add(id)

    return {
      id,
      label: shape.label.trim() || `Shape ${index + 1}`,
      description: shape.description.trim(),
      primitives: normalizePrimitives(shape.primitives),
    }
  })
}

function normalizePrimitives(primitives: PrimitivePayload[]): GeneratedPrimitive[] {
  return primitives.slice(0, 9).map((primitive) => ({
    kind: primitive.kind,
    position: primitive.position ? normalizeTuple(primitive.position) : undefined,
    rotation: primitive.rotation ? normalizeTuple(primitive.rotation) : undefined,
    scale: normalizeScale(primitive.scale),
    args: primitive.args ? primitive.args.map(normalizeNumber) : undefined,
  }))
}

function normalizeTuple(tuple: [number, number, number]): [number, number, number] {
  return [normalizeNumber(tuple[0]), normalizeNumber(tuple[1]), normalizeNumber(tuple[2])]
}

function normalizeScale(scale: PrimitivePayload['scale']): GeneratedPrimitive['scale'] {
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
