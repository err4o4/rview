import { useState, useCallback } from "react"
import * as THREE from "three"

export interface UseTFFollowReturn {
  /** Current TF follow position (null if not set) */
  followPosition: THREE.Vector3 | null
  /** Current TF follow rotation (null if not set) */
  followRotation: THREE.Quaternion | null
  /** Callback to update TF transform from TFViewer */
  onFollowTransformUpdate: (position: THREE.Vector3, rotation: THREE.Quaternion) => void
}

/**
 * Custom hook for managing TF frame following state.
 * Tracks position and rotation from a TF frame for camera following.
 *
 * @returns TF follow state and update callback
 */
export function useTFFollow(): UseTFFollowReturn {
  const [followPosition, setFollowPosition] = useState<THREE.Vector3 | null>(null)
  const [followRotation, setFollowRotation] = useState<THREE.Quaternion | null>(null)

  const handleFollowTransformUpdate = useCallback((position: THREE.Vector3, rotation: THREE.Quaternion) => {
    setFollowPosition(position)
    setFollowRotation(rotation)
  }, [])

  return {
    followPosition,
    followRotation,
    onFollowTransformUpdate: handleFollowTransformUpdate
  }
}
