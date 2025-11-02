import { useEffect, useRef } from "react"
import * as THREE from "three"
import type { PointCloudFrame } from "./usePointCloudFrames"
import { updateBufferAttribute, downsamplePoints, concatenateFrames } from "../utils/bufferOptimization"

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
  onPointCountChange
}: UsePointCloudGeometryOptions) {
  const animationFrameRef = useRef<number | undefined>(undefined)
  const bufferCapacityRef = useRef<number>(0)
  const latestBufferCapacityRef = useRef<number>(0)

  useEffect(() => {
    const updateGeometry = () => {
      if (!pointsRef.current || !latestPointsRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateGeometry)
        return
      }

      // Filter out old frames (skip if decayTimeMs is 0 for infinite retention)
      if (decayTimeMs > 0) {
        const currentTimeNs = Date.now() * 1_000_000 // Convert ms to ns
        const decayTimeNs = decayTimeMs * 1_000_000 // Convert ms to ns

        framesRef.current = framesRef.current.filter(
          (frame) => currentTimeNs - frame.timestamp <= decayTimeNs
        )
      }

      // Separate latest frame from older frames
      if (framesRef.current.length > 0) {
        const latestFrame = framesRef.current[framesRef.current.length - 1]
        const olderFrames = framesRef.current.slice(0, -1)

        // Render latest frame
        const latestPoints = latestFrame.points
        const latestPointCount = latestPoints.length / 3
        const latestColors = new Float32Array(latestPoints.length)

        // Set colors based on highlight toggle and mode
        if (latestScanHighlight) {
          if (latestScanMode === "brighter-red") {
            // Bright red
            for (let i = 0; i < latestPointCount; i++) {
              latestColors[i * 3] = 1.0     // R - bright red
              latestColors[i * 3 + 1] = 0.0 // G
              latestColors[i * 3 + 2] = 0.0 // B
            }
          } else {
            // Brighter mode - use intensity colors but increase brightness
            if (latestFrame.colors) {
              for (let i = 0; i < latestPointCount; i++) {
                // Increase brightness by 50%
                latestColors[i * 3] = Math.min(1.0, latestFrame.colors[i * 3] * 1.5)
                latestColors[i * 3 + 1] = Math.min(1.0, latestFrame.colors[i * 3 + 1] * 1.5)
                latestColors[i * 3 + 2] = Math.min(1.0, latestFrame.colors[i * 3 + 2] * 1.5)
              }
            } else {
              // Default to white if no colors available
              for (let i = 0; i < latestPointCount; i++) {
                latestColors[i * 3] = 1.0
                latestColors[i * 3 + 1] = 1.0
                latestColors[i * 3 + 2] = 1.0
              }
            }
          }
        } else {
          // No highlight - use same colors as older frames
          if (latestFrame.colors) {
            latestColors.set(latestFrame.colors)
          } else {
            // Default to white if no colors available
            for (let i = 0; i < latestPointCount; i++) {
              latestColors[i * 3] = 1.0
              latestColors[i * 3 + 1] = 1.0
              latestColors[i * 3 + 2] = 1.0
            }
          }
        }

        // Update latest scan geometry
        const latestGeometry = latestPointsRef.current.geometry
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

        // Render older frames
        if (olderFrames.length > 0) {
          // Concatenate all older frames
          const { points: allPoints, colors: allColors } = concatenateFrames(olderFrames)

          // Downsample if exceeds max points budget
          const { points: finalPoints, colors: finalColors } = downsamplePoints(allPoints, allColors, maxPoints)
          const pointCount = finalPoints.length / 3

          // Update older frames geometry
          const currentGeometry = pointsRef.current.geometry
          const usage = decayTimeMs > 0 ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage

          bufferCapacityRef.current = updateBufferAttribute(
            currentGeometry,
            'position',
            finalPoints,
            bufferCapacityRef.current,
            usage
          )

          // Update colors
          const colorAttr = currentGeometry.getAttribute('color') as THREE.BufferAttribute
          const colorBufferSize = colorAttr ? colorAttr.array.length : 0
          const requiredSize = finalColors.length

          if (!colorAttr || colorBufferSize < requiredSize) {
            // Need to create new color buffer
            const newCapacity = Math.ceil(pointCount * 1.2)
            const newColorBuffer = new Float32Array(newCapacity * 3)
            newColorBuffer.set(finalColors)
            const newColorAttribute = new THREE.BufferAttribute(newColorBuffer, 3)
            newColorAttribute.setUsage(usage)
            currentGeometry.setAttribute('color', newColorAttribute)
          } else {
            // Reuse existing color buffer
            colorAttr.array.set(finalColors, 0)
            colorAttr.needsUpdate = true
          }

          // Report actual point count being rendered (older + latest)
          onPointCountChange?.(pointCount + latestPointCount)
        } else {
          // No older frames, clear older geometry
          pointsRef.current.geometry.setDrawRange(0, 0)
          onPointCountChange?.(latestPointCount)
        }
      } else {
        // No frames at all, clear everything
        if (pointsRef.current?.geometry) {
          pointsRef.current.geometry.setDrawRange(0, 0)
        }
        if (latestPointsRef.current?.geometry) {
          latestPointsRef.current.geometry.setDrawRange(0, 0)
        }
        onPointCountChange?.(0)
      }

      animationFrameRef.current = requestAnimationFrame(updateGeometry)
    }

    updateGeometry()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [
    framesRef,
    pointsRef,
    latestPointsRef,
    decayTimeMs,
    maxPoints,
    latestScanHighlight,
    latestScanMode,
    onPointCountChange
  ])

  // Return refs for capacity tracking
  return {
    bufferCapacityRef,
    latestBufferCapacityRef
  }
}
