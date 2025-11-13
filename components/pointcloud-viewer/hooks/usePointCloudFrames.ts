import { useRef, useCallback, useEffect } from "react"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type PointCloudMessage } from "@/lib/services/unifiedWebSocket"

/**
 * Represents a single point cloud frame
 */
export interface PointCloudFrame {
  timestamp: number
  points: Float32Array
  colors?: Float32Array
}

export interface UsePointCloudFramesOptions {
  /** ROS topic to subscribe to */
  topic: string
  /** Decay time in milliseconds (0 = keep only latest frame) */
  decayTimeMs: number
  /** Downsample ratio (0.2 = keep 20%, 1 = keep all) */
  pointFilterNumber: number
  /** Trigger value that causes frames to be cleared */
  clearTrigger?: number
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean, error: string | null) => void
  /** Callback when point count changes */
  onPointCountChange?: (count: number) => void
}

export interface UsePointCloudFramesReturn {
  /** Array of point cloud frames */
  frames: React.MutableRefObject<PointCloudFrame[]>
  /** Whether connected to ROS */
  connected: boolean
  /** Connection error if any */
  error: string | null
  /** Function to manually clear all frames */
  clearFrames: () => void
}

/**
 * Custom hook for managing point cloud frames from a ROS topic.
 * Handles subscription, frame buffering, and decay logic.
 *
 * @param options - Configuration options
 * @returns Frame data and control functions
 */
export function usePointCloudFrames({
  topic,
  decayTimeMs,
  pointFilterNumber,
  clearTrigger,
  onConnectionChange,
  onPointCountChange
}: UsePointCloudFramesOptions): UsePointCloudFramesReturn {
  const framesRef = useRef<PointCloudFrame[]>([])

  // Memoize the message handler to prevent re-subscriptions
  const handleMessage = useCallback((message: PointCloudMessage) => {
    let points = message.points
    let colors = message.colors

    // Apply downsampling if enabled (pointFilterNumber > 0)
    if (pointFilterNumber < 1) {
      const totalPoints = message.points.length / 3
      const targetPoints = Math.floor(totalPoints * pointFilterNumber)

      if (targetPoints < totalPoints) {
        const newPoints = new Float32Array(targetPoints * 3)
        const newColors = colors ? new Float32Array(targetPoints * 3) : undefined

        // Uniform sampling - take every Nth point
        const step = totalPoints / targetPoints

        for (let i = 0; i < targetPoints; i++) {
          const sourceIndex = Math.floor(i * step)

          // Copy point coordinates
          newPoints[i * 3] = message.points[sourceIndex * 3]
          newPoints[i * 3 + 1] = message.points[sourceIndex * 3 + 1]
          newPoints[i * 3 + 2] = message.points[sourceIndex * 3 + 2]

          // Copy colors if available
          if (colors && newColors) {
            newColors[i * 3] = colors[sourceIndex * 3]
            newColors[i * 3 + 1] = colors[sourceIndex * 3 + 1]
            newColors[i * 3 + 2] = colors[sourceIndex * 3 + 2]
          }
        }

        points = newPoints
        colors = newColors
      }
    }

    // Performance: When decay is disabled (0), keep only latest message
    // This prevents unbounded memory growth and reduces processing
    if (decayTimeMs === 0) {
      framesRef.current = [{
        timestamp: message.timestamp,
        points: points,
        colors: colors,
      }]
    } else {
      framesRef.current.push({
        timestamp: message.timestamp,
        points: points,
        colors: colors,
      })
    }
  }, [decayTimeMs, pointFilterNumber])

  // Subscribe to point cloud topic and add frames to buffer
  const { connected, error } = useRosTopic<PointCloudMessage>({
    topic,
    messageType: MessageType.POINT_CLOUD,
    enabled: true,
    onMessage: handleMessage,
  })

  // Report connection status to parent
  useEffect(() => {
    onConnectionChange?.(connected, error)
  }, [connected, error, onConnectionChange])

  // Clear points when clearTrigger changes
  const clearFrames = useCallback(() => {
    framesRef.current = []
    onPointCountChange?.(0)
  }, [onPointCountChange])

  useEffect(() => {
    if (clearTrigger !== undefined && clearTrigger > 0) {
      clearFrames()
    }
  }, [clearTrigger, clearFrames])

  return {
    frames: framesRef,
    connected,
    error,
    clearFrames
  }
}
