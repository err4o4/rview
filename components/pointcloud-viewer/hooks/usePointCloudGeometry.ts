import { useEffect, useRef } from "react"
import * as THREE from "three"
import type { PointCloudFrame } from "./usePointCloudFrames"
import { updateBufferAttribute } from "../utils/bufferOptimization"
import type { ProcessRequest, ProcessResponse } from "../workers/pointCloudProcessor.worker"

export interface UsePointCloudGeometryOptions {
  /** Ref to frames array */
  framesRef: React.MutableRefObject<PointCloudFrame[]>
  /** Ref to older points mesh */
  pointsRef: React.RefObject<THREE.Points | null>
  /** Ref to latest points mesh */
  latestPointsRef: React.RefObject<THREE.Points | null>
  /** Decay time in milliseconds (0 = infinite retention) */
  decayTimeMs: number
  /** Maximum number of older points (0 = unlimited) */
  maxPoints: number
  /** Whether to highlight latest scan */
  latestScanHighlight: boolean
  /** Latest scan highlight mode */
  latestScanMode: 'brighter-red' | 'brighter'
  /** Clear trigger value (changes when reset is clicked) */
  clearTrigger?: number
  /** Callback when point count changes */
  onPointCountChange?: (count: number) => void
}

/**
 * Custom hook that continuously updates point cloud geometry from frames.
 * Manages buffer optimization, decay, and separate rendering of latest vs older scans.
 *
 * @param options - Configuration options
 */
export function usePointCloudGeometry({
  framesRef,
  pointsRef,
  latestPointsRef,
  decayTimeMs,
  maxPoints,
  latestScanHighlight,
  latestScanMode,
  clearTrigger,
  onPointCountChange
}: UsePointCloudGeometryOptions) {
  const animationFrameRef = useRef<number | undefined>(undefined)
  const bufferCapacityRef = useRef<number>(0)
  const latestBufferCapacityRef = useRef<number>(0)
  const workerRef = useRef<Worker | null>(null)
  const lastFrameCountRef = useRef<number>(0)
  const lastFrameTimestampRef = useRef<number>(0)
  const processingRef = useRef<boolean>(false)
  const lastClearTriggerRef = useRef<number | undefined>(clearTrigger)
  const lastDecayCheckRef = useRef<number>(0)

  // Store settings in refs to avoid recreating worker when they change
  const decayTimeMsRef = useRef(decayTimeMs)
  const maxPointsRef = useRef(maxPoints)
  const latestScanHighlightRef = useRef(latestScanHighlight)
  const latestScanModeRef = useRef(latestScanMode)

  // Update refs when settings change
  decayTimeMsRef.current = decayTimeMs
  maxPointsRef.current = maxPoints
  latestScanHighlightRef.current = latestScanHighlight
  latestScanModeRef.current = latestScanMode

  // Handle clear trigger separately to avoid recreating worker
  useEffect(() => {
    if (clearTrigger !== undefined && clearTrigger !== lastClearTriggerRef.current) {
      lastFrameCountRef.current = -1 // Force update on next check
      lastFrameTimestampRef.current = 0 // Reset timestamp tracking
      processingRef.current = false // Reset processing flag
      lastClearTriggerRef.current = clearTrigger
    }
  }, [clearTrigger])

  useEffect(() => {
    // Reset processing flag when worker is recreated
    processingRef.current = false
    lastFrameCountRef.current = 0
    lastFrameTimestampRef.current = 0

    // Initialize worker
    workerRef.current = new Worker(
      new URL('../workers/pointCloudProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    )

    // Handle worker errors
    workerRef.current.onerror = (error) => {
      console.error('Worker error:', error)
      processingRef.current = false // Reset flag on error
    }

    // Handle worker responses
    workerRef.current.onmessage = (e: MessageEvent<ProcessResponse>) => {
      processingRef.current = false

      if (!pointsRef.current || !latestPointsRef.current) return

      const { olderPoints, olderColors, latestPoints, latestColors, totalPointCount } = e.data

      // Update latest scan geometry
      if (latestPoints.length > 0) {
        const latestGeometry = latestPointsRef.current.geometry
        const latestPointCount = latestPoints.length / 3

        latestBufferCapacityRef.current = updateBufferAttribute(
          latestGeometry,
          'position',
          latestPoints,
          latestBufferCapacityRef.current,
          THREE.DynamicDrawUsage
        )

        // Update latest scan colors
        const latestColorAttr = latestGeometry.getAttribute('color') as THREE.BufferAttribute
        if (!latestColorAttr || latestColorAttr.array.length < latestColors.length) {
          const newCapacity = Math.ceil(latestPointCount * 1.2)
          const newColorBuffer = new Float32Array(newCapacity * 3)
          newColorBuffer.set(latestColors)
          const newColorAttribute = new THREE.BufferAttribute(newColorBuffer, 3)
          newColorAttribute.setUsage(THREE.DynamicDrawUsage)
          latestGeometry.setAttribute('color', newColorAttribute)
        } else {
          latestColorAttr.array.set(latestColors, 0)
          latestColorAttr.needsUpdate = true
        }
      } else {
        // Clear latest scan
        latestPointsRef.current.geometry.setDrawRange(0, 0)
      }

      // Update older frames geometry
      if (olderPoints.length > 0) {
        const currentGeometry = pointsRef.current.geometry
        const usage = decayTimeMsRef.current > 0 ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage
        const olderPointCount = olderPoints.length / 3

        bufferCapacityRef.current = updateBufferAttribute(
          currentGeometry,
          'position',
          olderPoints,
          bufferCapacityRef.current,
          usage
        )

        // Update colors
        const colorAttr = currentGeometry.getAttribute('color') as THREE.BufferAttribute
        const colorBufferSize = colorAttr ? colorAttr.array.length : 0
        const requiredSize = olderColors.length

        if (!colorAttr || colorBufferSize < requiredSize) {
          const newCapacity = Math.ceil(olderPointCount * 1.2)
          const newColorBuffer = new Float32Array(newCapacity * 3)
          newColorBuffer.set(olderColors)
          const newColorAttribute = new THREE.BufferAttribute(newColorBuffer, 3)
          newColorAttribute.setUsage(usage)
          currentGeometry.setAttribute('color', newColorAttribute)
        } else {
          colorAttr.array.set(olderColors, 0)
          colorAttr.needsUpdate = true
        }
      } else {
        // Clear older frames
        pointsRef.current.geometry.setDrawRange(0, 0)
      }

      // Report point count
      onPointCountChange?.(totalPointCount)
    }

    const updateGeometry = () => {
      if (!pointsRef.current || !latestPointsRef.current || !workerRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateGeometry)
        return
      }

      // Apply decay filtering on main thread to clean up memory (throttled to every 200ms)
      const now = Date.now()
      if (decayTimeMsRef.current > 0 && framesRef.current.length > 0 && (now - lastDecayCheckRef.current) > 200) {
        lastDecayCheckRef.current = now
        const currentTimeNs = now * 1_000_000
        const decayTimeNs = decayTimeMsRef.current * 1_000_000

        const oldLength = framesRef.current.length
        framesRef.current = framesRef.current.filter(
          (frame) => currentTimeNs - frame.timestamp <= decayTimeNs
        )

        // If frames were removed by decay, that counts as a change
        if (oldLength !== framesRef.current.length && lastFrameCountRef.current === framesRef.current.length) {
          lastFrameCountRef.current = -1 // Force update
        }
      }

      // Check if frames changed
      const currentFrameCount = framesRef.current.length
      const latestFrameTimestamp = framesRef.current.length > 0
        ? framesRef.current[framesRef.current.length - 1].timestamp
        : 0

      // When decay is 0, frame count is always 1, so check timestamp instead
      const hasChanged = decayTimeMsRef.current === 0
        ? latestFrameTimestamp !== lastFrameTimestampRef.current
        : currentFrameCount !== lastFrameCountRef.current

      if (hasChanged && !processingRef.current) {
        lastFrameCountRef.current = currentFrameCount
        lastFrameTimestampRef.current = latestFrameTimestamp
        processingRef.current = true

        // Send frames to worker for processing
        const request: ProcessRequest = {
          type: 'process',
          frames: framesRef.current.map(f => ({
            points: f.points,
            colors: f.colors,
            timestamp: f.timestamp
          })),
          decayTimeMs: decayTimeMsRef.current,
          maxPoints: maxPointsRef.current,
          latestScanHighlight: latestScanHighlightRef.current,
          latestScanMode: latestScanModeRef.current,
          currentTimeMs: Date.now()
        }

        workerRef.current.postMessage(request)
      }

      animationFrameRef.current = requestAnimationFrame(updateGeometry)
    }

    updateGeometry()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [
    framesRef,
    pointsRef,
    latestPointsRef,
    onPointCountChange
  ])

  // Return refs for capacity tracking
  return {
    bufferCapacityRef,
    latestBufferCapacityRef
  }
}
