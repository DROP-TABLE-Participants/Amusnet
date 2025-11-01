import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedShapeDefinition } from '../generated/shapes'
import type { RoundStatus } from '../shared/messages'
import { FINAL_SHAPE_ID } from '../shared/shapes'
import type { ShapeId } from '../shared/shapes'
import { SLOT_DECOY_SHAPE_IDS } from '../shapes/slotDecoys'

type SpinnerParams = {
  roundStatus: RoundStatus
  countdownMs: number
  targetShapeId: ShapeId | null
  shapes: GeneratedShapeDefinition[]
}

export type ShapeSlotSpinnerState = {
  currentId: ShapeId | null
  previousId: ShapeId | null
  nextId: ShapeId | null
  locked: boolean
  spinning: boolean
}

const MIN_DURATION_MS = 2200
const LOCK_PROGRESS = 0.9
const MIN_SPIN_CYCLES = 18
const SPIN_CYCLE_MULTIPLIER = 7
const MAX_DECOYS = 6

const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3

const shuffleArray = <T,>(input: readonly T[]): T[] => {
  const result = [...input]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function useShapeSlotSpinner({ roundStatus, countdownMs, targetShapeId, shapes }: SpinnerParams): ShapeSlotSpinnerState {
  const generatedIds = useMemo<ShapeId[]>(() => shapes.map((shape) => shape.id as ShapeId), [shapes])

  const buildDecoySequence = useCallback(
    (target: ShapeId | null): ShapeId[] => {
      const decoyPool = shuffleArray(SLOT_DECOY_SHAPE_IDS)
      const generatedPool = shuffleArray(generatedIds.filter((id) => (target ? id !== target : true)))
      const combined = [...decoyPool, ...generatedPool]
      const sequence: ShapeId[] = []

      for (const id of combined) {
        if (!sequence.includes(id)) {
          sequence.push(id)
        }
        if (sequence.length >= MAX_DECOYS) {
          break
        }
      }

      if (sequence.length === 0) {
        sequence.push(FINAL_SHAPE_ID)
      }

      return sequence
    },
    [generatedIds],
  )

  const [shapeIds, setShapeIds] = useState<ShapeId[]>(() => buildDecoySequence(targetShapeId))
  const previousStatusRef = useRef<RoundStatus | null>(null)

  useEffect(() => {
    const previousStatus = previousStatusRef.current
    if (roundStatus === 'countdown' && previousStatus !== 'countdown') {
      setShapeIds(buildDecoySequence(targetShapeId))
    }
    previousStatusRef.current = roundStatus
  }, [buildDecoySequence, roundStatus, targetShapeId])

  useEffect(() => {
    if (!targetShapeId) {
      return
    }
    setShapeIds((current) => {
      if (current.includes(targetShapeId)) {
        return current
      }
      return [...current, targetShapeId]
    })
  }, [targetShapeId])

  const shapeCount = shapeIds.length
  const fallbackIndex = shapeCount > 0 ? 0 : -1

  const targetIndex = useMemo(() => {
    if (!targetShapeId) {
      return fallbackIndex
    }
    const index = shapeIds.indexOf(targetShapeId)
    return index >= 0 ? index : fallbackIndex
  }, [fallbackIndex, shapeIds, targetShapeId])

  const computeState = useCallback(
    (index: number, locked: boolean, spinning: boolean): ShapeSlotSpinnerState => {
      if (shapeCount === 0 || index < 0) {
        return {
          currentId: null,
          previousId: null,
          nextId: null,
          locked,
          spinning,
        }
      }
      const safeIndex = ((index % shapeCount) + shapeCount) % shapeCount
      const previousIndex = (safeIndex - 1 + shapeCount) % shapeCount
      const nextIndex = (safeIndex + 1) % shapeCount
      return {
        currentId: shapeIds[safeIndex],
        previousId: shapeIds[shapeCount > 1 ? previousIndex : safeIndex],
        nextId: shapeIds[shapeCount > 1 ? nextIndex : safeIndex],
        locked,
        spinning,
      }
    },
    [shapeCount, shapeIds],
  )

  const [state, setState] = useState<ShapeSlotSpinnerState>(() =>
    computeState(targetIndex, roundStatus !== 'countdown', false),
  )
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const initialCountdownRef = useRef<number>(MIN_DURATION_MS)

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (roundStatus === 'countdown' && countdownMs > initialCountdownRef.current) {
      initialCountdownRef.current = countdownMs
    }
    if (roundStatus !== 'countdown') {
      initialCountdownRef.current = MIN_DURATION_MS
    }
  }, [roundStatus, countdownMs])

  useEffect(() => {
    if (roundStatus === 'countdown') {
      return
    }
    setState(computeState(targetIndex, true, false))
  }, [computeState, roundStatus, targetIndex])

  useEffect(() => {
    if (roundStatus !== 'countdown' || shapeCount === 0) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    const totalDuration = Math.max(initialCountdownRef.current, MIN_DURATION_MS)
    startTimeRef.current = performance.now()
    const finalIndex = targetIndex >= 0 ? targetIndex : 0
    const spinCycles = Math.max(MIN_SPIN_CYCLES, shapeCount * SPIN_CYCLE_MULTIPLIER)

    const updateFrame = (timestamp: number) => {
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(Math.max(elapsed / totalDuration, 0), 1)
      const eased = easeOutCubic(progress)
      const locked = progress >= LOCK_PROGRESS
      const cycleIndex = Math.floor(eased * spinCycles)
      const nextIndex = locked ? finalIndex : cycleIndex % shapeCount

      setState(computeState(nextIndex, locked, progress < 1 && !locked))

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(updateFrame)
      } else {
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(updateFrame)

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [computeState, roundStatus, shapeCount, targetIndex])

  return state
}
