import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

export interface CameraSetupProps {
  fov: number
}

/**
 * Configures camera settings for point cloud viewing.
 * Sets near/far planes for km-scale point clouds and updates FOV from settings.
 */
export function CameraSetup({ fov }: CameraSetupProps) {
  const { camera } = useThree()

  useEffect(() => {
    // Set fixed near/far planes for km-scale point clouds
    camera.near = 0.001  // 1mm - allows extreme close zoom
    camera.far = 50000   // 50km - handles multi-km point clouds
    camera.updateProjectionMatrix()
  }, [camera])

  // Update FOV when settings change
  useEffect(() => {
    if ('fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, fov])

  return null
}
