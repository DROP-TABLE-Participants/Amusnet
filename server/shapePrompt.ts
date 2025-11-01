export const PRIMITIVE_KINDS = ['sphere', 'box', 'cone', 'cylinder', 'torus'] as const

export const SYSTEM_PROMPT = `You are a generative 3D silhouette designer for a mobile shadow-matching racing game.
Your job is to produce imaginative, physically plausible silhouettes built from a limited set of primitives.
Always output strict JSON that satisfies the provided schema. Do not include commentary, Markdown, or code fences.
If you cannot comply, return {"shapes": []}.
Each response must introduce fresh, distinct silhouettes with unique labels; never reuse earlier example names or recycled arrangements.`

export function buildShapePrompt(count: number): string {
  return `Generate ${count} unique silhouette definitions for a three-lane "Shadow Shapes Race" game.
Return ONLY JSON matching the schema you received. Omit any extra text.

Design rules:
- Provide exactly ${count} entries in the shapes array.
- Use only these primitive kinds: ${PRIMITIVE_KINDS.join(', ')}.
- Each shape must contain 4-9 primitives.
- Keep primitive positions within [-1.6, 1.6] on each axis so normalization keeps the model centered.
- Express rotations in degrees.
- Use scale values between 0.2 and 2.5. You may use either a single number or a triple array.
- Use "shape-<unique-alphanumeric>" for IDs with at least 4 extra characters.
- Craft short, vivid labels (3-40 chars) and 1-2 sentence descriptions (16-160 chars).
- Ensure silhouettes look balanced and readable from the front lane perspective.
- Avoid thin spikes or intersections that would be impossible to manufacture.
- Make every shape feel distinct in composition, emphasizing variety in symmetry, hierarchy, and motion cues.`
}
