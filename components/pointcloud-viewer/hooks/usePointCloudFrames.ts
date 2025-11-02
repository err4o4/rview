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
  clearTrigger,
  onConnectionChange,
  onPointCountChange
}: UsePointCloudFramesOptions): UsePointCloudFramesReturn {
  const framesRef = useRef<PointCloudFrame[]>([])

  // Memoize the message handler to prevent re-subscriptions
  const handleMessage = useCallback((message: PointCloudMessage) => {
    // Performance: When decay is disabled (0), keep only latest message
    // This prevents unbounded memory growth and reduces processing
    if (decayTimeMs === 0) {
      framesRef.current = [{
        timestamp: message.timestamp,
        points: message.points,
        colors: message.colors,
      }]
    } else {
      framesRef.current.push({
        timestamp: message.timestamp,
        points: message.points,
        colors: message.colors,
      })
    }
  }, [decayTimeMs])

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
