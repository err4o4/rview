"use client"

import { useState, useCallback } from "react"
import { Line } from "@react-three/drei"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type PathMessage } from "@/lib/services/unifiedWebSocket"
import * as THREE from "three"

interface PathViewerProps {
  topic: string
  enabled?: boolean
  lineWidth?: number
  color?: string
}

/**
 * Component to visualize nav_msgs/Path as a 3D line
 * Displays the path as a continuous line connecting all poses
 */
export function PathViewer({
  topic,
  enabled = true,
  lineWidth = 2,
  color = "#00ff00",
}: PathViewerProps) {
  const [points, setPoints] = useState<THREE.Vector3[]>([])

  // Subscribe to path topic
  const handleMessage = useCallback((message: PathMessage) => {
    // Extract positions from poses and convert to Vector3 array
    const newPoints: THREE.Vector3[] = message.poses.map((poseStamped) =>
      new THREE.Vector3(
        poseStamped.pose.position.x,
        poseStamped.pose.position.y,
        poseStamped.pose.position.z
      )
    )

    setPoints(newPoints)
  }, [])

  useRosTopic<PathMessage>({
    topic,
    messageType: MessageType.PATH,
    enabled: enabled,
    onMessage: handleMessage,
  })

  // Don't render if disabled or no points
  if (!enabled || points.length === 0) {
    return null
  }

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      rotation={[Math.PI / 2, Math.PI, 0]}
      transparent
      opacity={0.8}
    />
  )
}
