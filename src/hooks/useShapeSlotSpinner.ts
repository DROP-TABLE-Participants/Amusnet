import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedShapeDefinition } from '../generated/shapes'
import type { RoundStatus } from '../shared/messages'
import { FINAL_SHAPE_ID } from '../shared/shapes'
import type { ShapeId } from '../shared/shapes'

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

const MIN_DURATION_MS = 3000
const LOCK_PROGRESS = 0.82

const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3

export function useShapeSlotSpinner({ roundStatus, countdownMs, targetShapeId, shapes }: SpinnerParams): ShapeSlotSpinnerState {
  const shapeIds = useMemo<ShapeId[]>(() => {
    const ids = shapes.map((shape) => shape.id as ShapeId)
    if (targetShapeId && !ids.includes(targetShapeId)) {
      ids.push(targetShapeId)
    }
    if (ids.length === 0) {
      ids.push(FINAL_SHAPE_ID)
    }
    return ids
  }, [shapes, targetShapeId])

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

  const [state, setState] = useState<ShapeSlotSpinnerState>(() => computeState(targetIndex, roundStatus !== 'countdown', false))
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
    const spinCycles = Math.max(6, shapeCount * 3)

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
