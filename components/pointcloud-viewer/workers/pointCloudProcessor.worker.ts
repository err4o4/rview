/**
 * Web Worker for point cloud geometry processing.
 * Handles heavy array operations off the main thread to prevent stuttering.
 */

export interface PointCloudFrame {
  points: Float32Array
  colors?: Float32Array
  timestamp: number
}

export interface ProcessRequest {
  type: 'process'
  frames: PointCloudFrame[]
  decayTimeMs: number
  maxPoints: number
  latestScanHighlight: boolean
  latestScanMode: 'brighter-red' | 'brighter'
  currentTimeMs: number
}

export interface ProcessResponse {
  type: 'result'
  olderPoints: Float32Array
  olderColors: Float32Array
  latestPoints: Float32Array
  latestColors: Float32Array
  totalPointCount: number
}

/**
 * Concatenates multiple point cloud frames into single buffers.
 */
function concatenateFrames(
  frames: PointCloudFrame[]
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
      allColors.set(frame.colors, offset)
    } else {
      // Default to white
      const numPoints = frame.points.length / 3
      for (let i = 0; i < numPoints; i++) {
        allColors[offset + i * 3] = 1.0
        allColors[offset + i * 3 + 1] = 1.0
        allColors[offset + i * 3 + 2] = 1.0
      }
    }

    offset += frame.points.length
  })

  return { points: allPoints, colors: allColors }
}

/**
 * Downsamples point cloud data to meet max points budget.
 */
function downsamplePoints(
  points: Float32Array,
  colors: Float32Array,
  maxPoints: number
): { points: Float32Array; colors: Float32Array } {
  const totalPointCount = points.length / 3

  if (maxPoints <= 0 || totalPointCount <= maxPoints) {
    return { points, colors }
  }

  const decimatedPoints = new Float32Array(maxPoints * 3)
  const decimatedColors = new Float32Array(maxPoints * 3)
  const step = totalPointCount / maxPoints

  for (let i = 0; i < maxPoints; i++) {
    const index = Math.floor(i * step + Math.random() * step)
    const offset = Math.min(index, totalPointCount - 1) * 3

    decimatedPoints[i * 3] = points[offset]
    decimatedPoints[i * 3 + 1] = points[offset + 1]
    decimatedPoints[i * 3 + 2] = points[offset + 2]

    decimatedColors[i * 3] = colors[offset]
    decimatedColors[i * 3 + 1] = colors[offset + 1]
    decimatedColors[i * 3 + 2] = colors[offset + 2]
  }

  return {
    points: decimatedPoints,
    colors: decimatedColors
  }
}

/**
 * Generates colors for the latest scan based on highlight settings.
 */
function generateLatestColors(
  frame: PointCloudFrame,
  latestScanHighlight: boolean,
  latestScanMode: 'brighter-red' | 'brighter'
): Float32Array {
  const pointCount = frame.points.length / 3
  const latestColors = new Float32Array(pointCount * 3)

  if (latestScanHighlight) {
    if (latestScanMode === "brighter-red") {
      // Bright red
      for (let i = 0; i < pointCount; i++) {
        latestColors[i * 3] = 1.0
        latestColors[i * 3 + 1] = 0.0
        latestColors[i * 3 + 2] = 0.0
      }
    } else {
      // Brighter mode - increase brightness by 50%
      if (frame.colors) {
        for (let i = 0; i < pointCount; i++) {
          latestColors[i * 3] = Math.min(1.0, frame.colors[i * 3] * 1.5)
          latestColors[i * 3 + 1] = Math.min(1.0, frame.colors[i * 3 + 1] * 1.5)
          latestColors[i * 3 + 2] = Math.min(1.0, frame.colors[i * 3 + 2] * 1.5)
        }
      } else {
        // Default to white
        for (let i = 0; i < pointCount; i++) {
          latestColors[i * 3] = 1.0
          latestColors[i * 3 + 1] = 1.0
          latestColors[i * 3 + 2] = 1.0
        }
      }
    }
  } else {
    // No highlight - use same colors
    if (frame.colors) {
      latestColors.set(frame.colors)
    } else {
      // Default to white
      for (let i = 0; i < pointCount; i++) {
        latestColors[i * 3] = 1.0
        latestColors[i * 3 + 1] = 1.0
        latestColors[i * 3 + 2] = 1.0
      }
    }
  }

  return latestColors
}

// Worker message handler
self.onmessage = (e: MessageEvent<ProcessRequest>) => {
  const { frames, decayTimeMs, maxPoints, latestScanHighlight, latestScanMode, currentTimeMs } = e.data

  if (frames.length === 0) {
    // No frames - return empty buffers
    const response: ProcessResponse = {
      type: 'result',
      olderPoints: new Float32Array(0),
      olderColors: new Float32Array(0),
      latestPoints: new Float32Array(0),
      latestColors: new Float32Array(0),
      totalPointCount: 0
    }
    self.postMessage(response, {
      transfer: [
        response.olderPoints.buffer,
        response.olderColors.buffer,
        response.latestPoints.buffer,
        response.latestColors.buffer
      ]
    })
    return
  }

  // Filter out old frames (decay)
  let filteredFrames = frames
  if (decayTimeMs > 0) {
    const currentTimeNs = currentTimeMs * 1_000_000
    const decayTimeNs = decayTimeMs * 1_000_000
    filteredFrames = frames.filter(
      (frame) => currentTimeNs - frame.timestamp <= decayTimeNs
    )
  }

  if (filteredFrames.length === 0) {
    // All frames decayed - return empty buffers
    const response: ProcessResponse = {
      type: 'result',
      olderPoints: new Float32Array(0),
      olderColors: new Float32Array(0),
      latestPoints: new Float32Array(0),
      latestColors: new Float32Array(0),
      totalPointCount: 0
    }
    self.postMessage(response, {
      transfer: [
        response.olderPoints.buffer,
        response.olderColors.buffer,
        response.latestPoints.buffer,
        response.latestColors.buffer
      ]
    })
    return
  }

  // Separate latest frame from older frames
  const latestFrame = filteredFrames[filteredFrames.length - 1]
  const olderFrames = filteredFrames.slice(0, -1)

  // Process latest scan
  const latestPoints = latestFrame.points
  const latestColors = generateLatestColors(latestFrame, latestScanHighlight, latestScanMode)
  const latestPointCount = latestPoints.length / 3

  // Process older frames
  let olderPoints: Float32Array
  let olderColors: Float32Array
  let olderPointCount = 0

  if (olderFrames.length > 0) {
    // Concatenate all older frames
    const { points: allPoints, colors: allColors } = concatenateFrames(olderFrames)

    // Downsample if needed
    const { points: finalPoints, colors: finalColors } = downsamplePoints(allPoints, allColors, maxPoints)
    olderPoints = finalPoints
    olderColors = finalColors
    olderPointCount = finalPoints.length / 3
  } else {
    olderPoints = new Float32Array(0)
    olderColors = new Float32Array(0)
  }

  // Send result back to main thread with transferable objects
  const response: ProcessResponse = {
    type: 'result',
    olderPoints,
    olderColors,
    latestPoints,
    latestColors,
    totalPointCount: olderPointCount + latestPointCount
  }

  self.postMessage(response, {
    transfer: [
      response.olderPoints.buffer,
      response.olderColors.buffer,
      response.latestPoints.buffer,
      response.latestColors.buffer
    ]
  })
}
