import { useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { transformToWorldSpace, transformRotationToWorldSpace } from "../utils/coordinateTransforms"
import { createPositionSmoother, createRotationSmoother } from "../utils/smoothing"

export interface CameraFollowControllerProps {
  enabled: boolean
  followPosition: THREE.Vector3 | null
  followRotation: THREE.Quaternion | null
  smoothing: number
  lockAngle: boolean
}

/**
 * Controls camera to follow a TF frame with optional angle locking.
 *
 * Two modes:
 * 1. Follow only: Camera maintains relative position, user can rotate freely
 * 2. Follow + Lock: Camera is positioned behind TF frame, locked to its orientation
 */
export function CameraFollowController({
  enabled,
  followPosition,
  followRotation,
  smoothing,
  lockAngle
}: CameraFollowControllerProps) {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  // State tracking
  const initialDistanceRef = useRef<number | null>(null)
  const lastEnabledRef = useRef<boolean>(false)
  const lastAngleLockRef = useRef<boolean>(false)
  const lastSmoothedPositionRef = useRef<THREE.Vector3 | null>(null)

  // Smoothing utilities
  const positionSmootherRef = useRef(createPositionSmoother(smoothing))
  const rotationSmootherRef = useRef(createRotationSmoother(smoothing))

  useFrame(() => {
    if (!controlsRef.current) return

    if (enabled && followPosition) {
      const transformedPosition = transformToWorldSpace(followPosition)

      // Initialize on first frame
      if (!lastEnabledRef.current) {
        positionSmootherRef.current.set(transformedPosition)
        lastSmoothedPositionRef.current = transformedPosition.clone()
        initialDistanceRef.current = camera.position.distanceTo(controlsRef.current.target)

        if (followRotation) {
          const transformedRotation = transformRotationToWorldSpace(followRotation)
          rotationSmootherRef.current.set(transformedRotation)
        }

        lastEnabledRef.current = true
      }

      // Smooth the position
      const smoothedPos = smoothing === 0
        ? transformedPosition
        : positionSmootherRef.current.smooth(transformedPosition)

      // Calculate position delta
      const positionDelta = smoothedPos.clone().sub(lastSmoothedPositionRef.current!)

      if (lockAngle && followRotation) {
        // FOLLOW + LOCK MODE: Camera locked to TF orientation

        // Capture initial distance when lock is first enabled
        if (!lastAngleLockRef.current) {
          initialDistanceRef.current = camera.position.distanceTo(controlsRef.current.target)
          lastAngleLockRef.current = true
        }

        // Transform and smooth rotation
        const transformedRotation = transformRotationToWorldSpace(followRotation)
        const smoothedRot = smoothing === 0
          ? transformedRotation
          : rotationSmootherRef.current.smooth(transformedRotation)

        // Get forward direction from smoothed rotation (X axis in ROS/TF coordinate system)
        const tfForward = new THREE.Vector3(1, 0, 0).applyQuaternion(smoothedRot)

        // Update distance if user zoomed
        const currentDistance = camera.position.distanceTo(controlsRef.current.target)
        if (initialDistanceRef.current !== null && Math.abs(currentDistance - initialDistanceRef.current) > 0.01) {
          initialDistanceRef.current = currentDistance
        }

        // Position camera BEHIND TF frame using forward direction
        controlsRef.current.target.copy(smoothedPos)
        const cameraOffset = tfForward.clone().multiplyScalar(-initialDistanceRef.current!)
        camera.position.copy(smoothedPos.clone().add(cameraOffset))
        camera.lookAt(controlsRef.current.target)

      } else {
        // FOLLOW ONLY MODE: Camera maintains relative position

        // Move both camera and target by the same delta
        camera.position.add(positionDelta)
        controlsRef.current.target.add(positionDelta)

        // Track zoom changes
        const currentDistance = camera.position.distanceTo(controlsRef.current.target)
        if (initialDistanceRef.current !== null && Math.abs(currentDistance - initialDistanceRef.current) > 0.01) {
          initialDistanceRef.current = currentDistance
        }

        // Reset angle lock state
        lastAngleLockRef.current = false
      }

      // Update last smoothed position
      lastSmoothedPositionRef.current!.copy(smoothedPos)

      // Update controls
      controlsRef.current.update()

    } else if (lastEnabledRef.current) {
      // Reset all state when follow is disabled
      lastSmoothedPositionRef.current = null
      initialDistanceRef.current = null
      lastEnabledRef.current = false
      lastAngleLockRef.current = false
      positionSmootherRef.current.reset()
      rotationSmootherRef.current.reset()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={0}
      maxDistance={2000}
      enableDamping={true}
      dampingFactor={0.05}
      enablePan={!lockAngle} // Disable pan when angle is locked
      enableRotate={!lockAngle} // Disable rotation when angle is locked
      enableZoom={true} // Always allow zoom
    />
  )
}
