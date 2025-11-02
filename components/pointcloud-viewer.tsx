"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type PointCloudMessage } from "@/lib/services/unifiedWebSocket"
import { useSettings } from "@/lib/hooks/useSettings"
import { TFViewer } from "@/components/tf-viewer"
import * as THREE from "three"
import { Loader2, RotateCcw, Navigation, Lock, Eye, EyeOff, Palette, Video, Circle as RecordCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import Stats from "stats.js"

// Custom shader for distance-based point scaling
const distanceScaledVertexShader = `
  uniform vec3 tfPosition;
  uniform float baseSize;
  uniform bool enableScaling;

  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float pointSize = baseSize;

    if (enableScaling) {
      // Calculate distance from this point to TF position
      float dist = distance(position, tfPosition);

      // Scale from 1x below 1m, then linearly from 1x at 1m to 30x at 100m
      float scale = 1.0;
      if (dist < 1.0) {
        scale = 1.0;
      } else {
        // Linear interpolation from 1x at 1m to 30x at 100m
        // scale = 1.0 + (dist - 1.0) * (29.0 / 99.0)
        scale = 1.0 + (dist - 1.0) * 0.75;
        //scale = dist * 2.0;
      }
      pointSize *= scale;
    }

    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
  }
`

const distanceScaledFragmentShader = `
  varying vec3 vColor;

  void main() {
    // Circular point shape
    vec2 center = gl_PointCoord - vec2(0.5);
    if (length(center) > 0.5) discard;

    gl_FragColor = vec4(vColor, 1.0);
  }
`

interface PointCloudProps {
  topic: string
  clearTrigger?: number
  latestScanHighlight?: boolean
  tfPosition?: THREE.Vector3 | null
  onPointCountChange?: (count: number) => void
  onConnectionChange?: (connected: boolean, error: string | null) => void
}

interface PointCloudFrame {
  timestamp: number
  points: Float32Array
  colors?: Float32Array
}

function PointCloud({ topic, clearTrigger, latestScanHighlight = true, tfPosition, onPointCountChange, onConnectionChange }: PointCloudProps) {
  const pointsRef = useRef<THREE.Points>(null) // Older scans
  const latestPointsRef = useRef<THREE.Points>(null) // Latest scan
  const framesRef = useRef<PointCloudFrame[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const bufferCapacityRef = useRef<number>(0) // Track buffer capacity to avoid recreating
  const latestBufferCapacityRef = useRef<number>(0) // Track buffer capacity for latest scan
  const { settings } = useSettings()
  const decayTimeMs = settings.pointcloud.decayTimeSeconds * 1000 // Convert seconds to milliseconds
  const maxPoints = settings.pointcloud.maxPoints
  const pointSize = settings.pointcloud.pointSize
  const latestScanPointSize = settings.pointcloud.latestScanPointSize
  const latestScanMode = settings.pointcloud.latestScanMode
  const dynamicLatestPointScaling = settings.pointcloud.dynamicLatestPointScaling

  // Shader material for distance-based point scaling
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        tfPosition: { value: new THREE.Vector3(0, 0, 0) },
        baseSize: { value: latestScanPointSize * 0.005 },
        enableScaling: { value: dynamicLatestPointScaling },
      },
      vertexShader: distanceScaledVertexShader,
      fragmentShader: distanceScaledFragmentShader,
      depthTest: true,
      depthWrite: true,
    })
  }, [])

  // Update shader uniforms
  useFrame(() => {
    if (shaderMaterial) {
      // Update TF position in shader
      if (tfPosition) {
        shaderMaterial.uniforms.tfPosition.value.copy(tfPosition)
      }

      // Update base size and scaling toggle
      shaderMaterial.uniforms.baseSize.value = (latestScanHighlight ? latestScanPointSize : pointSize) * 0.005
      shaderMaterial.uniforms.enableScaling.value = dynamicLatestPointScaling
    }
  })

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
  useEffect(() => {
    if (clearTrigger !== undefined && clearTrigger > 0) {
      framesRef.current = []
      bufferCapacityRef.current = 0 // Reset capacity on clear
      latestBufferCapacityRef.current = 0
      // Clear the geometry
      if (pointsRef.current?.geometry) {
        pointsRef.current.geometry.setDrawRange(0, 0)
      }
      if (latestPointsRef.current?.geometry) {
        latestPointsRef.current.geometry.setDrawRange(0, 0)
      }
      onPointCountChange?.(0)
    }
  }, [clearTrigger, onPointCountChange])

  // Continuously update geometry based on decay time
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
        const latestPosAttr = latestGeometry.getAttribute('position') as THREE.BufferAttribute

        if (!latestPosAttr || latestBufferCapacityRef.current < latestPointCount) {
          const newCapacity = Math.ceil(latestPointCount * 1.2)
          const newBuffer = new Float32Array(newCapacity * 3)
          newBuffer.set(latestPoints)
          const newAttribute = new THREE.BufferAttribute(newBuffer, 3)
          newAttribute.setUsage(THREE.DynamicDrawUsage)
          latestGeometry.setAttribute('position', newAttribute)
          latestBufferCapacityRef.current = newCapacity
          latestGeometry.setDrawRange(0, latestPointCount)
        } else {
          latestPosAttr.set(latestPoints, 0)
          latestPosAttr.needsUpdate = true
          latestGeometry.setDrawRange(0, latestPointCount)
        }

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
          // Calculate total size for older frames
          let totalSize = 0
          olderFrames.forEach((frame) => {
            totalSize += frame.points.length
          })

          const allPoints = new Float32Array(totalSize)
          const allColors = new Float32Array(totalSize)
          let offset = 0

          olderFrames.forEach((frame) => {
            allPoints.set(frame.points, offset)

            if (frame.colors) {
              // Use intensity-based colors
              allColors.set(frame.colors, offset)
            } else {
              // Default to white if no colors available
              const numPoints = frame.points.length / 3
              for (let i = 0; i < numPoints; i++) {
                allColors[offset + i * 3] = 1.0
                allColors[offset + i * 3 + 1] = 1.0
                allColors[offset + i * 3 + 2] = 1.0
              }
            }

            offset += frame.points.length
          })

          // Downsample if exceeds max points budget
          let finalPoints = allPoints
          let finalColors = allColors
          const totalPointCount = allPoints.length / 3

          if (maxPoints > 0 && totalPointCount > maxPoints) {
            // Random sampling: better spatial distribution than sequential
            const decimatedPoints = new Float32Array(maxPoints * 3)
            const decimatedColors = new Float32Array(maxPoints * 3)
            const step = totalPointCount / maxPoints

            // Sample points at regular intervals with slight randomization
            for (let i = 0; i < maxPoints; i++) {
              const index = Math.floor(i * step + Math.random() * step)
              const offset = Math.min(index, totalPointCount - 1) * 3
              decimatedPoints[i * 3] = allPoints[offset]         // x
              decimatedPoints[i * 3 + 1] = allPoints[offset + 1] // y
              decimatedPoints[i * 3 + 2] = allPoints[offset + 2] // z

              decimatedColors[i * 3] = allColors[offset]         // r
              decimatedColors[i * 3 + 1] = allColors[offset + 1] // g
              decimatedColors[i * 3 + 2] = allColors[offset + 2] // b
            }

            finalPoints = decimatedPoints
            finalColors = decimatedColors
          }

          const pointCount = finalPoints.length / 3

          // Performance: Reuse buffer capacity to avoid recreating geometry
          const currentGeometry = pointsRef.current.geometry
          const positionAttr = currentGeometry.getAttribute('position') as THREE.BufferAttribute

          if (!positionAttr || bufferCapacityRef.current < pointCount) {
            // Need to create new buffer (first time or capacity exceeded)
            const newCapacity = Math.ceil(pointCount * 1.2) // 20% headroom
            const newBuffer = new Float32Array(newCapacity * 3)
            newBuffer.set(finalPoints)

            const newAttribute = new THREE.BufferAttribute(newBuffer, 3)
            newAttribute.setUsage(decayTimeMs > 0 ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage)

            currentGeometry.setAttribute('position', newAttribute)
            bufferCapacityRef.current = newCapacity
            currentGeometry.setDrawRange(0, pointCount)
          } else {
            // Reuse existing buffer
            positionAttr.set(finalPoints, 0)
            positionAttr.needsUpdate = true
            currentGeometry.setDrawRange(0, pointCount)
          }

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
            newColorAttribute.setUsage(decayTimeMs > 0 ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage)
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
  }, [decayTimeMs, maxPoints, pointSize, latestScanPointSize, latestScanHighlight, latestScanMode, onPointCountChange])

  return (
    <>
      {/* Older scans - normal size without dynamic scaling */}
      <points ref={pointsRef} rotation={[Math.PI / 2, Math.PI, 0]} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
          size={pointSize * 0.005}
          vertexColors={true}
          sizeAttenuation={true}
          depthTest={true}
          depthWrite={true}
        />
      </points>
      {/* Latest scan - uses custom shader for per-point distance-based scaling */}
      <points ref={latestPointsRef} rotation={[Math.PI / 2, Math.PI, 0]} frustumCulled={false} material={shaderMaterial}>
        <bufferGeometry />
      </points>
    </>
  )
}

// Setup camera with fixed near/far planes for large point clouds
function CameraSetup({ fov }: { fov: number }) {
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

// Camera follow controller component
function CameraFollowController({
  enabled,
  followPosition,
  followRotation,
  smoothing,
  lockAngle,
}: {
  enabled: boolean
  followPosition: THREE.Vector3 | null
  followRotation: THREE.Quaternion | null
  smoothing: number
  lockAngle: boolean
}) {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  // State tracking
  const initialDistanceRef = useRef<number | null>(null)
  const lastEnabledRef = useRef<boolean>(false)
  const lastAngleLockRef = useRef<boolean>(false)

  // Smoothing state
  const smoothedPositionRef = useRef<THREE.Vector3 | null>(null)
  const smoothedRotationRef = useRef<THREE.Quaternion | null>(null)
  const lastSmoothedPositionRef = useRef<THREE.Vector3 | null>(null)

  // Moving average buffers for better smoothing
  const positionHistoryBuffer = useRef<THREE.Vector3[]>([])
  const rotationHistoryBuffer = useRef<THREE.Quaternion[]>([])
  const bufferSize = Math.max(2, Math.ceil(smoothing * 10)) // Buffer size based on smoothing factor

  // Helper function to apply coordinate system transformation
  const transformToWorldSpace = (position: THREE.Vector3) => {
    const transformed = position.clone()
    transformed.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    transformed.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
    return transformed
  }

  // Helper function to smooth position using moving average + lerp
  const smoothPosition = (newPosition: THREE.Vector3): THREE.Vector3 => {
    // Add to history buffer
    positionHistoryBuffer.current.push(newPosition.clone())
    if (positionHistoryBuffer.current.length > bufferSize) {
      positionHistoryBuffer.current.shift()
    }

    // Calculate moving average
    const avgPosition = new THREE.Vector3(0, 0, 0)
    positionHistoryBuffer.current.forEach((pos: THREE.Vector3) => {
      avgPosition.add(pos)
    })
    avgPosition.divideScalar(positionHistoryBuffer.current.length)

    // Apply lerp smoothing on top of moving average
    // Higher smoothing = lower alpha = smoother movement
    const alpha = Math.max(0.01, Math.min(0.3, 0.3 / (smoothing + 1)))
    if (smoothedPositionRef.current) {
      smoothedPositionRef.current.lerp(avgPosition, alpha)
    } else {
      smoothedPositionRef.current = avgPosition.clone()
    }

    return smoothedPositionRef.current
  }

  // Helper function to smooth rotation using moving average + slerp
  const smoothRotation = (newRotation: THREE.Quaternion): THREE.Quaternion => {
    // Add to history buffer
    rotationHistoryBuffer.current.push(newRotation.clone())
    if (rotationHistoryBuffer.current.length > bufferSize) {
      rotationHistoryBuffer.current.shift()
    }

    // Calculate average quaternion (simplified - just use latest for slerp)
    const avgRotation = rotationHistoryBuffer.current[rotationHistoryBuffer.current.length - 1]

    // Apply slerp smoothing
    // Higher smoothing = lower alpha = smoother rotation
    const alpha = Math.max(0.01, Math.min(0.3, 0.3 / (smoothing + 1)))
    if (smoothedRotationRef.current) {
      smoothedRotationRef.current.slerp(avgRotation, alpha)
    } else {
      smoothedRotationRef.current = avgRotation.clone()
    }

    return smoothedRotationRef.current
  }

  useFrame(() => {
    if (!controlsRef.current) return

    if (enabled && followPosition) {
      // Transform TF position to world space
      const transformedPosition = transformToWorldSpace(followPosition)

      // Initialize on first frame
      if (!lastEnabledRef.current) {
        smoothedPositionRef.current = transformedPosition.clone()
        lastSmoothedPositionRef.current = transformedPosition.clone()
        positionHistoryBuffer.current = [transformedPosition.clone()]
        initialDistanceRef.current = camera.position.distanceTo(controlsRef.current.target)

        if (followRotation) {
          const transformedRotation = followRotation.clone()
          transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
          transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI))
          smoothedRotationRef.current = transformedRotation.clone()
          rotationHistoryBuffer.current = [transformedRotation.clone()]
        }

        lastEnabledRef.current = true
      }

      // Smooth the TF position (or use raw if smoothing=0)
      let smoothedPos: THREE.Vector3
      if (smoothing === 0) {
        // No smoothing - use raw position and clear buffers
        smoothedPos = transformedPosition
        smoothedPositionRef.current = transformedPosition.clone()
        positionHistoryBuffer.current = []
        rotationHistoryBuffer.current = []
      } else {
        smoothedPos = smoothPosition(transformedPosition)
      }

      // Calculate position delta for camera movement
      const positionDelta = smoothedPos.clone().sub(lastSmoothedPositionRef.current!)

      if (lockAngle && followRotation) {
        // FOLLOW + LOCK MODE: Camera locked to TF orientation

        // Capture initial distance when lock is first enabled
        if (!lastAngleLockRef.current) {
          initialDistanceRef.current = camera.position.distanceTo(controlsRef.current.target)
          lastAngleLockRef.current = true
        }

        // Transform rotation
        const transformedRotation = followRotation.clone()
        transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
        transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI))

        // Smooth rotation (or use raw if smoothing=0)
        let smoothedRot: THREE.Quaternion
        if (smoothing === 0) {
          // No smoothing - use raw rotation
          smoothedRot = transformedRotation
          smoothedRotationRef.current = transformedRotation.clone()
        } else {
          smoothedRot = smoothRotation(transformedRotation)
        }

        // Get forward direction from smoothed rotation
        const tfForward = new THREE.Vector3(1, 0, 0).applyQuaternion(smoothedRot)

        // Update distance if user zoomed
        const currentDistance = camera.position.distanceTo(controlsRef.current.target)
        if (initialDistanceRef.current !== null && Math.abs(currentDistance - initialDistanceRef.current) > 0.01) {
          initialDistanceRef.current = currentDistance
        }

        // Position camera behind TF using smoothed values
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
      smoothedPositionRef.current = null
      smoothedRotationRef.current = null
      lastSmoothedPositionRef.current = null
      positionHistoryBuffer.current = []
      rotationHistoryBuffer.current = []
      initialDistanceRef.current = null
      lastEnabledRef.current = false
      lastAngleLockRef.current = false
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={0}
      maxDistance={2000}
      enableDamping
      dampingFactor={0.05}
      enablePan={!lockAngle} // Disable pan when angle is locked
      enableRotate={!lockAngle} // Disable rotation when angle is locked
      enableZoom={true} // Only zoom allowed when locked
    />
  )
}

export function PointCloudViewer({ topic }: PointCloudProps) {
  const [clearTrigger, setClearTrigger] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(false)
  const [cameraAngleLockEnabled, setCameraAngleLockEnabled] = useState(false)
  const [tfVisible, setTfVisible] = useState(true)
  const [latestScanHighlightEnabled, setLatestScanHighlightEnabled] = useState(true)
  const [followPosition, setFollowPosition] = useState<THREE.Vector3 | null>(null)
  const [followRotation, setFollowRotation] = useState<THREE.Quaternion | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrameCount, setRecordedFrameCount] = useState(0)
  const [isPreparingZip, setIsPreparingZip] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const { settings } = useSettings()

  // FPS Counter - outside Canvas
  const statsRef = useRef<Stats | null>(null)
  useEffect(() => {
    const stats = new Stats()
    stats.showPanel(0) // 0: fps, 1: ms, 2: mb
    stats.dom.style.position = 'absolute'
    stats.dom.style.left = '16px'
    stats.dom.style.top = 'calc(3rem + env(safe-area-inset-top) + 0.5rem + 76px)'
    stats.dom.style.zIndex = '10'
    document.body.appendChild(stats.dom)
    statsRef.current = stats

    const animate = () => {
      stats.update()
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      if (stats.dom.parentNode) {
        document.body.removeChild(stats.dom)
      }
    }
  }, [])

  // Recording refs - optimized capture (JPEG for 10-20x faster encoding)
  const recordingFramesRef = useRef<(Blob | null)[]>([]) // Frame blobs with null placeholders to maintain order
  const recordingAnimationFrameRef = useRef<number | null>(null)
  const frameCountRef = useRef<number>(0)
  const capturedFrameCountRef = useRef<number>(0) // Track completed captures
  const lastCaptureTimeRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  // Use recording settings for capture configuration
  const captureIntervalMs = 1000 / settings.recording.fps
  const captureQuality = settings.recording.quality

  const handleConnectionChange = useCallback((isConnected: boolean, err: string | null) => {
    setConnected(isConnected)
    setError(err)
  }, [])

  const handleFollowTransformUpdate = useCallback((position: THREE.Vector3, rotation: THREE.Quaternion) => {
    setFollowPosition(position)
    setFollowRotation(rotation)
  }, [])

  // Start recording PNG sequence (optimized: lower FPS, lower resolution)
  const startRecording = useCallback(() => {
    if (!canvasRef.current || !rendererRef.current) return

    try {
      // Reset frame counter and storage
      recordingFramesRef.current = []
      frameCountRef.current = 0
      capturedFrameCountRef.current = 0
      lastCaptureTimeRef.current = performance.now()
      setRecordedFrameCount(0)
      setIsRecording(true)

      // Capture frames using requestAnimationFrame at 30 FPS
      const captureFrame = () => {
        if (!canvasRef.current) return

        const now = performance.now()
        const elapsed = now - lastCaptureTimeRef.current

        // Only capture every ~33ms (30 FPS)
        if (elapsed >= captureIntervalMs) {
          lastCaptureTimeRef.current = now
          const frameIndex = frameCountRef.current
          frameCountRef.current++

          // Pre-allocate the slot to maintain order
          recordingFramesRef.current[frameIndex] = null

          // Use toBlob() - JPEG is 10-20x faster than PNG
          const mimeType = settings.recording.format === 'jpeg' ? 'image/jpeg' : 'image/png'
          const quality = captureQuality // Quality from settings (0.0-1.0)

          canvasRef.current.toBlob(
            (blob) => {
              if (blob) {
                // Store at the correct index to maintain frame order
                recordingFramesRef.current[frameIndex] = blob
                capturedFrameCountRef.current++
                setRecordedFrameCount(capturedFrameCountRef.current)
              }
            },
            mimeType,
            quality
          )
        }

        // Continue capturing
        recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)
      }

      // Start the capture loop
      recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)

    } catch (err) {
      console.error('Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [captureIntervalMs, captureQuality, settings.recording.fps, settings.recording.format])

  // Stop recording and download PNG sequence as zip
  const stopRecording = useCallback(async () => {
    if (recordingAnimationFrameRef.current === null) return

    // Stop capturing frames
    cancelAnimationFrame(recordingAnimationFrameRef.current)
    recordingAnimationFrameRef.current = null
    setIsRecording(false)

    // Wait a bit for any pending toBlob() calls to finish
    await new Promise(resolve => setTimeout(resolve, 500))

    // Filter out null entries to get only successfully captured frames
    const capturedFrames = recordingFramesRef.current.filter((blob): blob is Blob => blob !== null)
    const totalFrames = capturedFrames.length
    console.log(`Recording stopped. Total frames captured: ${totalFrames} out of ${frameCountRef.current} requested`)

    if (totalFrames === 0) {
      console.warn('No frames captured')
      return
    }

    // Show preparing zip message
    setIsPreparingZip(true)
    setZipProgress(0)

    // Process ZIP generation in chunks to avoid blocking the main thread
    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      console.log('Preparing ZIP file...')

      const fileExt = settings.recording.format === 'jpeg' ? 'jpg' : 'png'

      // Add frames in chunks with periodic yields to event loop
      const chunkSize = 10
      for (let i = 0; i < capturedFrames.length; i += chunkSize) {
        const chunk = capturedFrames.slice(i, i + chunkSize)

        // Add chunk of frames (Blobs are added directly, much faster than base64)
        chunk.forEach((blob, chunkIndex) => {
          const frameNumber = String(i + chunkIndex).padStart(5, '0')
          zip.file(`frame_${frameNumber}.${fileExt}`, blob, { binary: true })
        })

        // Update progress
        const progress = Math.round(((i + chunkSize) / capturedFrames.length) * 50)
        setZipProgress(Math.min(progress, 50))

        // Yield to event loop to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // Generate zip file with progress callback
      console.log('Compressing ZIP file...')
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        },
        (metadata) => {
          // Update progress: 50-100% for compression phase
          const progress = 50 + Math.round(metadata.percent / 2)
          setZipProgress(progress)
        }
      )

      setZipProgress(100)

      // Download the zip
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      const filename = `pointcloud-recording-${Date.now()}-${totalFrames}frames.zip`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`Download complete: ${filename}`)

      if (settings.recording.format === 'jpeg') {
        console.log(`\n=== VIDEO ENCODING OPTIONS (JPEG Input @ ${settings.recording.fps} FPS) ===\n`)
        console.log('RECOMMENDED (high quality H.264):')
        console.log(`ffmpeg -framerate ${settings.recording.fps} -pattern_type glob -i "frame_*.jpg" -c:v libx264 -crf 18 -pix_fmt yuv420p output.mp4`)
        console.log('  • JPEG input is already lossy, so lossless encoding not needed')
        console.log('  • CRF 18 = visually lossless for H.264\n')
        console.log('Option 2 - ProRes (best for video editors):')
        console.log(`ffmpeg -framerate ${settings.recording.fps} -pattern_type glob -i "frame_*.jpg" -c:v prores_ks -profile:v 3 output.mov\n`)
        console.log('Option 3 - High compatibility (smaller file):')
        console.log(`ffmpeg -framerate ${settings.recording.fps} -pattern_type glob -i "frame_*.jpg" -c:v libx264 -crf 23 -pix_fmt yuv420p output.mp4`)
      } else {
        console.log(`\n=== LOSSLESS VIDEO ENCODING OPTIONS (PNG Input @ ${settings.recording.fps} FPS) ===\n`)
        console.log('RECOMMENDED (lossless H.264):')
        console.log(`ffmpeg -framerate ${settings.recording.fps} -pattern_type glob -i "frame_*.png" -c:v libx264 -qp 0 -pix_fmt yuv444p output.mp4`)
        console.log('  • -qp 0 = truly lossless\n')
        console.log('Option 2 - ProRes 4444 (best for video editors):')
        console.log(`ffmpeg -framerate ${settings.recording.fps} -pattern_type glob -i "frame_*.png" -c:v prores_ks -profile:v 4444 output.mov`)
      }

    } catch (err) {
      console.error('Failed to create zip:', err)
      console.log('Falling back to individual frame downloads (first 10 frames only)...')

      const fileExt = settings.recording.format === 'jpeg' ? 'jpg' : 'png'

      // Fallback: download first 10 frames individually (using captured frames, not raw array)
      capturedFrames.slice(0, 10).forEach((blob, index) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const frameNumber = String(index).padStart(5, '0')
        a.download = `frame_${frameNumber}.${fileExt}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
    } finally {
      // Clean up
      setIsPreparingZip(false)
      setZipProgress(0)
      recordingFramesRef.current = []
      frameCountRef.current = 0
    }
  }, [settings.recording.format, settings.recording.fps])

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return (
    <div className="relative w-full h-full min-h-[100px] bg-black/5 dark:bg-black/20 overflow-hidden">
      {/* Topic Info - Left Side */}
      <div className="absolute left-4 z-10" style={{ top: 'calc(3rem + env(safe-area-inset-top) + 0.5rem)' }}>
        <div className="px-3 py-2 bg-background/90 backdrop-blur-sm rounded-md border">
          <div className="text-xs text-muted-foreground">{topic}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            {pointCount.toLocaleString()} points
          </div>
        </div>
      </div>

      {/* Control Buttons - Right Side */}
      <div className="absolute right-4 z-10 flex items-center gap-2" style={{ top: 'calc(3rem + env(safe-area-inset-top) + 0.5rem)' }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCameraFollowEnabled(prev => !prev)}
          title={cameraFollowEnabled ? "Disable camera follow" : "Enable camera follow"}
          className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
            cameraFollowEnabled
              ? "text-blue-500 border-blue-500"
              : "text-muted-foreground"
          }`}
        >
          <Navigation className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCameraAngleLockEnabled(prev => !prev)}
          title={cameraAngleLockEnabled ? "Disable angle lock" : "Enable angle lock"}
          className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
            cameraAngleLockEnabled
              ? "text-red-500 border-red-500"
              : "text-muted-foreground"
          }`}
        >
          <Lock className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTfVisible(prev => !prev)}
          title={tfVisible ? "Hide TF arrows" : "Show TF arrows"}
          className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
            tfVisible
              ? "text-green-500 border-green-500"
              : "text-muted-foreground"
          }`}
        >
          {tfVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLatestScanHighlightEnabled(prev => !prev)}
          title={latestScanHighlightEnabled ? "Disable latest scan highlight" : "Enable latest scan highlight"}
          className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
            latestScanHighlightEnabled
              ? settings.pointcloud.latestScanMode === "brighter-red"
                ? "text-red-500 border-red-500"
                : "text-yellow-500 border-yellow-500"
              : "text-muted-foreground"
          }`}
        >
          <Palette className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setClearTrigger(prev => prev + 1)}
          title="Clear points"
          className="h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRecording}
          title={isRecording
            ? "Stop recording (downloads as ZIP)"
            : `Start recording ${settings.recording.format === 'jpeg' ? 'JPEG' : 'PNG'} sequence (${settings.recording.fps}fps${settings.recording.format === 'jpeg' ? ', optimized for speed' : ', lossless'})`
          }
          className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
            isRecording
              ? "text-red-500 border-red-500 animate-pulse"
              : "text-muted-foreground"
          }`}
        >
          {isRecording ? <RecordCircle className="h-4 w-4 fill-current" /> : <Video className="h-4 w-4" />}
        </Button>
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-full" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <RecordCircle className="h-3 w-3 fill-white animate-pulse" />
          <span className="text-xs font-medium text-white">
            Recording {settings.recording.format === 'jpeg' ? 'JPEG' : 'PNG'} sequence: {recordedFrameCount} frames ({(recordedFrameCount / settings.recording.fps).toFixed(1)}s @ {settings.recording.fps}fps)
          </span>
        </div>
      )}

      {/* ZIP Preparation Indicator */}
      {isPreparingZip && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 px-4 py-3 bg-blue-500/90 backdrop-blur-sm rounded-lg" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
            <span className="text-sm font-medium text-white">
              Preparing ZIP file...
            </span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-white h-full transition-all duration-300 ease-out"
              style={{ width: `${zipProgress}%` }}
            />
          </div>
          <span className="text-xs text-white/90">
            {zipProgress}% complete
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="px-4 py-3 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {!connected && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connecting to WebSocket...
            </p>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: [5, 5, 5],
          fov: settings.pointcloud.fov,
          near: 0.01,
          far: 5000 // Large far plane for 1km+ point clouds
        }}
        className="w-full h-full"
        dpr={[1, 1.5]} // Limit pixel ratio for performance (1x on low-end, 1.5x on high-end)
        performance={{ min: 0.5 }} // Enable automatic performance scaling
        gl={{
          antialias: false, // Disable antialiasing for performance
          powerPreference: "high-performance",
          alpha: false,
          preserveDrawingBuffer: true, // Essential for recording - prevents flickering
        }}
        onCreated={({ gl }) => {
          // Store canvas and renderer refs for recording
          canvasRef.current = gl.domElement
          rendererRef.current = gl

          // Configure color space - keep it simple for accurate colors
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.NoToneMapping // No tone mapping to avoid washed out colors
          gl.toneMappingExposure = 1.0
        }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[10, 10, 5]} intensity={1.0} />

        {/* Grid Helper */}
        <Grid
          args={[10, 10]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#374151"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
        />

        {/* Point Cloud */}
        <PointCloud
          topic={topic}
          clearTrigger={clearTrigger}
          latestScanHighlight={latestScanHighlightEnabled}
          tfPosition={followPosition}
          onPointCountChange={setPointCount}
          onConnectionChange={handleConnectionChange}
        />

        {/* TF Frames */}
        <TFViewer
          topic={settings.tf.topic}
          enabled={settings.tf.enabled}
          visible={tfVisible}
          followFrameId={cameraFollowEnabled ? settings.tf.follow.frameId : undefined}
          onFollowTransformUpdate={handleFollowTransformUpdate}
        />

        {/* Camera Setup */}
        <CameraSetup fov={settings.pointcloud.fov} />

        {/* Controls with Camera Follow */}
        <CameraFollowController
          enabled={cameraFollowEnabled}
          followPosition={followPosition}
          followRotation={followRotation}
          smoothing={settings.tf.follow.smoothing}
          lockAngle={cameraAngleLockEnabled}
        />
      </Canvas>

      {/* Controls Info 
      <div className="absolute bottom-4 left-4 z-10 px-3 py-2 bg-background/90 backdrop-blur-sm rounded-md border shadow-sm">
        <p className="text-xs text-muted-foreground">
          Left click: Rotate • Right click: Pan • Scroll: Zoom
        </p>
      </div>
      */}
    </div>
  )
}
