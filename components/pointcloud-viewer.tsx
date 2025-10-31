"use client"

import { useEffect, useRef } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type PointCloudMessage } from "@/lib/services/unifiedWebSocket"
import { useSettings } from "@/lib/hooks/useSettings"
import * as THREE from "three"
import { Loader2 } from "lucide-react"

interface PointCloudProps {
  topic: string
}

interface PointCloudFrame {
  timestamp: number
  points: Float32Array
}

function PointCloud({ topic }: PointCloudProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const framesRef = useRef<PointCloudFrame[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const { settings } = useSettings()
  const decayTimeMs = settings.pointcloud.decayTimeMs

  // Subscribe to point cloud topic and add frames to buffer
  useRosTopic<PointCloudMessage>({
    topic,
    messageType: MessageType.POINT_CLOUD,
    enabled: true,
    onMessage: (message) => {
      framesRef.current.push({
        timestamp: message.timestamp,
        points: message.points,
      })
    },
  })

  // Continuously update geometry based on decay time
  useEffect(() => {
    const updateGeometry = () => {
      if (!pointsRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateGeometry)
        return
      }

      const currentTimeNs = Date.now() * 1_000_000 // Convert ms to ns
      const decayTimeNs = decayTimeMs * 1_000_000 // Convert ms to ns

      // Filter out old frames
      framesRef.current = framesRef.current.filter(
        (frame) => currentTimeNs - frame.timestamp <= decayTimeNs
      )

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

          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(allPoints, 3)
          )

          pointsRef.current.geometry.dispose()
          pointsRef.current.geometry = geometry
        }
      } else if (pointsRef.current.geometry) {
        // Clear geometry if no frames remain
        pointsRef.current.geometry.dispose()
        pointsRef.current.geometry = new THREE.BufferGeometry()
      }

      animationFrameRef.current = requestAnimationFrame(updateGeometry)
    }

    updateGeometry()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [decayTimeMs])

  return (
    <points ref={pointsRef} rotation={[Math.PI / 2, Math.PI, 0]}>
      <bufferGeometry />
      <pointsMaterial
        size={0.01}
        vertexColors={false}
        sizeAttenuation={true}
        color={0x3b82f6}
      />
    </points>
  )
}

export function PointCloudViewer({ topic }: PointCloudProps) {
  const { connected, error } = useRosTopic<PointCloudMessage>({
    topic,
    messageType: MessageType.POINT_CLOUD,
    enabled: true,
  })

  return (
    <div className="relative w-full h-full min-h-[100px] bg-black/5 dark:bg-black/20 overflow-hidden">
      {/* Topic Info */}
      <div className="absolute top-4 right-4 z-10 px-3 py-2 bg-background/90 backdrop-blur-sm rounded-md border">
        <div className="text-xs text-muted-foreground">{topic}</div>
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
        camera={{ position: [5, 5, 5], fov: 60 }}
        className="w-full h-full"
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
        <PointCloud topic={topic} />

        {/* Controls */}
        <OrbitControls
          makeDefault
          minDistance={1}
          maxDistance={100}
          enableDamping
          dampingFactor={0.05}
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
