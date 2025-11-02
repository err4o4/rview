"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type PointCloudMessage } from "@/lib/services/unifiedWebSocket"
import { useSettings } from "@/lib/hooks/useSettings"
import { TFViewer } from "@/components/tf-viewer"
import * as THREE from "three"
import { Loader2, RotateCcw, Navigation } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

interface PointCloudProps {
  topic: string
  clearTrigger?: number
  onPointCountChange?: (count: number) => void
  onConnectionChange?: (connected: boolean, error: string | null) => void
}

interface PointCloudFrame {
  timestamp: number
  points: Float32Array
}

function PointCloud({ topic, clearTrigger, onPointCountChange, onConnectionChange }: PointCloudProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const framesRef = useRef<PointCloudFrame[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const bufferCapacityRef = useRef<number>(0) // Track buffer capacity to avoid recreating
  const { settings } = useSettings()
  const decayTimeMs = settings.pointcloud.decayTimeMs
  const maxPoints = settings.pointcloud.maxPoints
  const pointSize = settings.pointcloud.pointSize

  // Memoize the message handler to prevent re-subscriptions
  const handleMessage = useCallback((message: PointCloudMessage) => {
    // Performance: When decay is disabled (0), keep only latest message
    // This prevents unbounded memory growth and reduces processing
    if (decayTimeMs === 0) {
      framesRef.current = [{
        timestamp: message.timestamp,
        points: message.points,
      }]
    } else {
      framesRef.current.push({
        timestamp: message.timestamp,
        points: message.points,
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
      // Clear the geometry
      if (pointsRef.current?.geometry) {
        pointsRef.current.geometry.setDrawRange(0, 0)
        onPointCountChange?.(0)
      }
    }
  }, [clearTrigger, onPointCountChange])

  // Continuously update geometry based on decay time
  useEffect(() => {
    const updateGeometry = () => {
      if (!pointsRef.current) {
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

      // Merge all active frames into a single geometry
      if (framesRef.current.length > 0) {
        // Calculate total size
        let totalSize = 0
        framesRef.current.forEach((frame) => {
          totalSize += frame.points.length
        })

        if (totalSize > 0) {
          // Pre-allocate and copy data efficiently
          const allPoints = new Float32Array(totalSize)
          let offset = 0
          framesRef.current.forEach((frame) => {
            allPoints.set(frame.points, offset)
            offset += frame.points.length
          })

          // Downsample if exceeds max points budget
          let finalPoints = allPoints
          const totalPointCount = allPoints.length / 3

          if (maxPoints > 0 && totalPointCount > maxPoints) {
            // Random sampling: better spatial distribution than sequential
            const decimatedPoints = new Float32Array(maxPoints * 3)
            const step = totalPointCount / maxPoints

            // Sample points at regular intervals with slight randomization
            for (let i = 0; i < maxPoints; i++) {
              const index = Math.floor(i * step + Math.random() * step)
              const offset = Math.min(index, totalPointCount - 1) * 3
              decimatedPoints[i * 3] = allPoints[offset]         // x
              decimatedPoints[i * 3 + 1] = allPoints[offset + 1] // y
              decimatedPoints[i * 3 + 2] = allPoints[offset + 2] // z
            }

            finalPoints = decimatedPoints
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

          // Report actual point count being rendered
          onPointCountChange?.(pointCount)
        }
      } else if (pointsRef.current.geometry) {
        // Clear geometry if no frames remain (but keep buffer capacity)
        pointsRef.current.geometry.setDrawRange(0, 0)
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
  }, [decayTimeMs, maxPoints, pointSize, onPointCountChange])

  return (
    <points ref={pointsRef} rotation={[Math.PI / 2, Math.PI, 0]} frustumCulled={false}>
      <bufferGeometry />
      <pointsMaterial
        size={pointSize * 0.005}
        vertexColors={false}
        sizeAttenuation={true}
        color={0x3b82f6}
        depthTest={true}
        depthWrite={true}
      />
    </points>
  )
}

// Setup camera with fixed near/far planes for large point clouds
function CameraSetup() {
  const { camera } = useThree()

  useEffect(() => {
    // Set fixed near/far planes for km-scale point clouds
    camera.near = 0.001  // 1mm - allows extreme close zoom
    camera.far = 50000   // 50km - handles multi-km point clouds
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

// Camera follow controller component
function CameraFollowController({
  enabled,
  followPosition,
  followRotation,
  smoothing,
}: {
  enabled: boolean
  followPosition: THREE.Vector3 | null
  followRotation: THREE.Quaternion | null
  smoothing: number
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  // Store the initial relative offset when follow mode is first enabled
  const initialOffsetRef = useRef<THREE.Vector3 | null>(null)
  const lastTFPositionRef = useRef<THREE.Vector3 | null>(null)
  const smoothedTFPositionRef = useRef<THREE.Vector3 | null>(null)
  const lastEnabledRef = useRef<boolean>(false)

  useFrame(() => {
    if (!controlsRef.current) return

    // Only process TF follow if enabled and position available
    if (enabled && followPosition) {
      // Apply rotation adjustment for coordinate system (same as point cloud)
      const adjustedTFPosition = followPosition.clone()
      adjustedTFPosition.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      adjustedTFPosition.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)

      // When follow is first enabled, capture the initial offset
      if (!lastEnabledRef.current) {
        // Calculate offset from current orbit target to TF position
        initialOffsetRef.current = controlsRef.current.target.clone().sub(adjustedTFPosition)
        lastTFPositionRef.current = adjustedTFPosition.clone()
        smoothedTFPositionRef.current = adjustedTFPosition.clone()
        lastEnabledRef.current = true
      }

      // If following is enabled, update the orbit target to follow TF
      if (initialOffsetRef.current && lastTFPositionRef.current && smoothedTFPositionRef.current) {
        // Smoothly interpolate towards the new TF position
        // Higher smoothing value = smoother but slower follow (0 = instant, 1 = very slow)
        const alpha = 1 - smoothing
        smoothedTFPositionRef.current.lerp(adjustedTFPosition, alpha)

        // Calculate how much the smoothed TF has moved
        const tfDelta = smoothedTFPositionRef.current.clone().sub(lastTFPositionRef.current)

        // Move the orbit controls target by the smoothed delta
        controlsRef.current.target.add(tfDelta)

        // Update last position to the smoothed position
        lastTFPositionRef.current.copy(smoothedTFPositionRef.current)

        // Update controls
        controlsRef.current.update()
      }
    } else if (lastEnabledRef.current) {
      // When follow is disabled, clear the offset
      initialOffsetRef.current = null
      lastTFPositionRef.current = null
      smoothedTFPositionRef.current = null
      lastEnabledRef.current = false
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
      enablePan={true}
      enableRotate={true}
      enableZoom={true}
    />
  )
}

export function PointCloudViewer({ topic }: PointCloudProps) {
  const [clearTrigger, setClearTrigger] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(false)
  const [followPosition, setFollowPosition] = useState<THREE.Vector3 | null>(null)
  const [followRotation, setFollowRotation] = useState<THREE.Quaternion | null>(null)
  const { settings } = useSettings()

  const handleConnectionChange = useCallback((isConnected: boolean, err: string | null) => {
    setConnected(isConnected)
    setError(err)
  }, [])

  const handleFollowTransformUpdate = useCallback((position: THREE.Vector3, rotation: THREE.Quaternion) => {
    setFollowPosition(position)
    setFollowRotation(rotation)
  }, [])

  return (
    <div className="relative w-full h-full min-h-[100px] bg-black/5 dark:bg-black/20 overflow-hidden">
      {/* Topic Info with Clear Button */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
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
          onClick={() => setClearTrigger(prev => prev + 1)}
          title="Clear points"
          className="h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <div className="px-3 py-2 bg-background/90 backdrop-blur-sm rounded-md border">
          <div className="text-xs text-muted-foreground">{topic}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            {pointCount.toLocaleString()} points
          </div>
        </div>
      </div>

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
          fov: 60,
          near: 0.01,
          far: 5000 // Large far plane for 1km+ point clouds
        }}
        className="w-full h-full"
        dpr={[1, 1.5]} // Limit pixel ratio for performance (1x on low-end, 1.5x on high-end)
        performance={{ min:1 }} // Enable automatic performance scaling
        gl={{
          antialias: false, // Disable antialiasing for performance
          powerPreference: "high-performance",
          alpha: false,
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

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
          onPointCountChange={setPointCount}
          onConnectionChange={handleConnectionChange}
        />

        {/* TF Frames */}
        <TFViewer
          topic={settings.tf.topic}
          enabled={settings.tf.enabled}
          followFrameId={cameraFollowEnabled ? settings.tf.follow.frameId : undefined}
          onFollowTransformUpdate={handleFollowTransformUpdate}
        />

        {/* Camera Setup */}
        <CameraSetup />

        {/* Controls with Camera Follow */}
        <CameraFollowController
          enabled={cameraFollowEnabled}
          followPosition={followPosition}
          followRotation={followRotation}
          smoothing={settings.tf.follow.smoothing}
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
