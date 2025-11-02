import * as THREE from "three"

/**
 * Creates a position smoother that uses moving average + lerp interpolation.
 * Higher smoothing values result in smoother but more delayed movement.
 *
 * @param smoothing - Smoothing factor (0 = no smoothing, higher = more smoothing)
 * @returns Object with smooth() and reset() methods
 */
export function createPositionSmoother(smoothing: number) {
  const bufferSize = Math.max(2, Math.ceil(smoothing * 10))
  const historyBuffer: THREE.Vector3[] = []
  let smoothedPosition: THREE.Vector3 | null = null

  return {
    /**
     * Smooth a new position value
     * @param newPosition - The new position to smooth
     * @returns Smoothed position
     */
    smooth(newPosition: THREE.Vector3): THREE.Vector3 {
      // Add to history buffer
      historyBuffer.push(newPosition.clone())
      if (historyBuffer.length > bufferSize) {
        historyBuffer.shift()
      }

      // Calculate moving average
      const avgPosition = new THREE.Vector3(0, 0, 0)
      historyBuffer.forEach((pos: THREE.Vector3) => {
        avgPosition.add(pos)
      })
      avgPosition.divideScalar(historyBuffer.length)

      // Apply lerp smoothing on top of moving average
      // Higher smoothing = lower alpha = smoother movement
      const alpha = Math.max(0.01, Math.min(0.3, 0.3 / (smoothing + 1)))
      if (smoothedPosition) {
        smoothedPosition.lerp(avgPosition, alpha)
      } else {
        smoothedPosition = avgPosition.clone()
      }

      return smoothedPosition
    },

    /**
     * Reset the smoother state
     */
    reset() {
      historyBuffer.length = 0
      smoothedPosition = null
    },

    /**
     * Set smoothed position directly (useful for initialization)
     */
    set(position: THREE.Vector3) {
      smoothedPosition = position.clone()
      historyBuffer.length = 0
      historyBuffer.push(position.clone())
    }
  }
}

/**
 * Creates a rotation smoother that uses moving average + slerp interpolation.
 * Higher smoothing values result in smoother but more delayed rotation.
 *
 * @param smoothing - Smoothing factor (0 = no smoothing, higher = more smoothing)
 * @returns Object with smooth() and reset() methods
 */
export function createRotationSmoother(smoothing: number) {
  const bufferSize = Math.max(2, Math.ceil(smoothing * 10))
  const historyBuffer: THREE.Quaternion[] = []
  let smoothedRotation: THREE.Quaternion | null = null

  return {
    /**
     * Smooth a new rotation value
     * @param newRotation - The new rotation to smooth
     * @returns Smoothed rotation
     */
    smooth(newRotation: THREE.Quaternion): THREE.Quaternion {
      // Add to history buffer
      historyBuffer.push(newRotation.clone())
      if (historyBuffer.length > bufferSize) {
        historyBuffer.shift()
      }

      // Calculate average quaternion (simplified - just use latest for slerp)
      const avgRotation = historyBuffer[historyBuffer.length - 1]

      // Apply slerp smoothing
      // Higher smoothing = lower alpha = smoother rotation
      const alpha = Math.max(0.01, Math.min(0.3, 0.3 / (smoothing + 1)))
      if (smoothedRotation) {
        smoothedRotation.slerp(avgRotation, alpha)
      } else {
        smoothedRotation = avgRotation.clone()
      }

      return smoothedRotation
    },

    /**
     * Reset the smoother state
     */
    reset() {
      historyBuffer.length = 0
      smoothedRotation = null
    },

    /**
     * Set smoothed rotation directly (useful for initialization)
     */
    set(rotation: THREE.Quaternion) {
      smoothedRotation = rotation.clone()
      historyBuffer.length = 0
      historyBuffer.push(rotation.clone())
    }
  }
}
