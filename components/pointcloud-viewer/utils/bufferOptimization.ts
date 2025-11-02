import * as THREE from "three"

/**
 * Updates a buffer attribute with optimized capacity management.
 * Reuses existing buffers when possible to avoid recreating geometry.
 *
 * @param geometry - The BufferGeometry to update
 * @param attributeName - Name of the attribute ('position' or 'color')
 * @param data - New data to set
 * @param currentCapacity - Current buffer capacity
 * @param usage - Buffer usage hint (StaticDrawUsage or DynamicDrawUsage)
 * @returns New capacity (may be unchanged)
 */
export function updateBufferAttribute(
  geometry: THREE.BufferGeometry,
  attributeName: 'position' | 'color',
  data: Float32Array,
  currentCapacity: number,
  usage: THREE.Usage = THREE.DynamicDrawUsage
): number {
  const itemSize = 3 // Both position and color use vec3
  const requiredCount = data.length / itemSize
  const attr = geometry.getAttribute(attributeName) as THREE.BufferAttribute | undefined

  if (!attr || currentCapacity < requiredCount) {
    // Need to create new buffer (first time or capacity exceeded)
    const newCapacity = Math.ceil(requiredCount * 1.2) // 20% headroom
    const newBuffer = new Float32Array(newCapacity * itemSize)
    newBuffer.set(data)

    const newAttribute = new THREE.BufferAttribute(newBuffer, itemSize)
    newAttribute.setUsage(usage)

    geometry.setAttribute(attributeName, newAttribute)
    geometry.setDrawRange(0, requiredCount)
    return newCapacity
  } else {
    // Reuse existing buffer
    attr.set(data, 0)
    attr.needsUpdate = true
    geometry.setDrawRange(0, requiredCount)
    return currentCapacity
  }
}

/**
 * Downsamples point cloud data to meet max points budget.
 * Uses random sampling with uniform distribution for better spatial coverage.
 *
 * @param points - Point positions (Float32Array with length = numPoints * 3)
 * @param colors - Point colors (Float32Array with length = numPoints * 3)
 * @param maxPoints - Maximum number of points to keep
 * @returns Downsampled points and colors
 */
export function downsamplePoints(
  points: Float32Array,
  colors: Float32Array,
  maxPoints: number
): { points: Float32Array; colors: Float32Array } {
  const totalPointCount = points.length / 3

  if (maxPoints <= 0 || totalPointCount <= maxPoints) {
    // No downsampling needed
    return { points, colors }
  }

  // Random sampling: better spatial distribution than sequential
  const decimatedPoints = new Float32Array(maxPoints * 3)
  const decimatedColors = new Float32Array(maxPoints * 3)
  const step = totalPointCount / maxPoints

  // Sample points at regular intervals with slight randomization
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.floor(i * step + Math.random() * step)
    const offset = Math.min(index, totalPointCount - 1) * 3

    decimatedPoints[i * 3] = points[offset]         // x
    decimatedPoints[i * 3 + 1] = points[offset + 1] // y
    decimatedPoints[i * 3 + 2] = points[offset + 2] // z

    decimatedColors[i * 3] = colors[offset]         // r
    decimatedColors[i * 3 + 1] = colors[offset + 1] // g
    decimatedColors[i * 3 + 2] = colors[offset + 2] // b
  }

  return {
    points: decimatedPoints,
    colors: decimatedColors
  }
}

/**
 * Concatenates multiple point cloud frames into single buffers.
 *
 * @param frames - Array of frames with points and optional colors
 * @returns Combined points and colors
 */
export function concatenateFrames(
  frames: Array<{ points: Float32Array; colors?: Float32Array }>
): { points: Float32Array; colors: Float32Array } {
  // Calculate total size
  let totalSize = 0
  frames.forEach((frame) => {
    totalSize += frame.points.length
  })

  const allPoints = new Float32Array(totalSize)
  const allColors = new Float32Array(totalSize)
  let offset = 0

  frames.forEach((frame) => {
    allPoints.set(frame.points, offset)

    if (frame.colors) {
      // Use provided colors
      allColors.set(frame.colors, offset)
    } else {
      // Default to white if no colors available
      const numPoints = frame.points.length / 3
      for (let i = 0; i < numPoints; i++) {
        allColors[offset + i * 3] = 1.0     // r
        allColors[offset + i * 3 + 1] = 1.0 // g
        allColors[offset + i * 3 + 2] = 1.0 // b
      }
    }

    offset += frame.points.length
  })

  return { points: allPoints, colors: allColors }
}
