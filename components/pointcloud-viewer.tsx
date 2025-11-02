"use client"

import { useRef, useState, useCallback, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Grid } from "@react-three/drei"
import { useSettings } from "@/lib/hooks/useSettings"
import { TFViewer } from "@/components/tf-viewer"
import * as THREE from "three"
import { Loader2 } from "lucide-react"

// Import extracted hooks
import { usePerformanceMonitor } from "./pointcloud-viewer/hooks/usePerformanceMonitor"
import { usePointCloudFrames } from "./pointcloud-viewer/hooks/usePointCloudFrames"
import { usePointCloudGeometry } from "./pointcloud-viewer/hooks/usePointCloudGeometry"
import { useTFFollow } from "./pointcloud-viewer/hooks/useTFFollow"
import { usePointCloudRecording } from "./pointcloud-viewer/hooks/usePointCloudRecording"

// Import extracted components
import { PointCloudInfo } from "./pointcloud-viewer/components/PointCloudInfo"
import { RecordingIndicators } from "./pointcloud-viewer/components/RecordingIndicators"
import { PointCloudControls } from "./pointcloud-viewer/components/PointCloudControls"
import { CameraSetup } from "./pointcloud-viewer/components/CameraSetup"
import { CameraFollowController } from "./pointcloud-viewer/components/CameraFollowController"

// Import shader utilities
import { createDistanceScalingMaterial } from "./pointcloud-viewer/shaders/distanceScaling"

interface PointCloudProps {
  topic: string
  clearTrigger?: number
  latestScanHighlight?: boolean
  tfPosition?: THREE.Vector3 | null
  onPointCountChange?: (count: number) => void
  onConnectionChange?: (connected: boolean, error: string | null) => void
}

/**
 * Internal PointCloud component that handles rendering of point cloud data.
 * Uses extracted hooks for frame management and geometry updates.
 */
function PointCloud({
  topic,
  clearTrigger,
  latestScanHighlight = true,
  tfPosition,
  onPointCountChange,
  onConnectionChange
}: PointCloudProps) {
  const pointsRef = useRef<THREE.Points>(null) // Older scans
  const latestPointsRef = useRef<THREE.Points>(null) // Latest scan
  const { settings } = useSettings()

  const decayTimeMs = settings.pointcloud.decayTimeSeconds * 1000
  const maxPoints = settings.pointcloud.maxPoints
  const pointSize = settings.pointcloud.pointSize
  const latestScanPointSize = settings.pointcloud.latestScanPointSize
  const latestScanMode = settings.pointcloud.latestScanMode
  const dynamicLatestPointScaling = settings.pointcloud.dynamicLatestPointScaling

  // Use extracted hooks for frame management
  const { frames, connected, error } = usePointCloudFrames({
    topic,
    decayTimeMs,
    clearTrigger,
    onConnectionChange,
    onPointCountChange
  })

  // Use extracted hook for geometry updates
  usePointCloudGeometry({
    framesRef: frames,
    pointsRef,
    latestPointsRef,
    decayTimeMs,
    maxPoints,
    latestScanHighlight,
    latestScanMode,
    onPointCountChange
  })

  // Shader material for distance-based point scaling (latest scan)
  const shaderMaterial = useMemo(() => {
    return createDistanceScalingMaterial(
      latestScanPointSize * 0.005,
      dynamicLatestPointScaling,
      new THREE.Vector3(0, 0, 0)
    )
  }, [latestScanPointSize, dynamicLatestPointScaling])

  // Update shader uniforms each frame
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

      {/* Latest scan - with optional dynamic scaling based on distance from TF */}
      <points ref={latestPointsRef} rotation={[Math.PI / 2, Math.PI, 0]} frustumCulled={false}>
        <bufferGeometry />
        <primitive object={shaderMaterial} attach="material" />
      </points>
    </>
  )
}

/**
 * Main PointCloudViewer component.
 * Orchestrates all functionality: TF following, recording, camera controls, and rendering.
 */
export function PointCloudViewer({ topic }: { topic: string }) {
  const { settings } = useSettings()

  // State management
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pointCount, setPointCount] = useState(0)
  const [clearTrigger, setClearTrigger] = useState(0)
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(false)
  const [cameraAngleLockEnabled, setCameraAngleLockEnabled] = useState(false)
  const [tfVisible, setTfVisible] = useState(true)
  const [latestScanHighlightEnabled, setLatestScanHighlightEnabled] = useState(true)

  // Refs for Canvas and renderer (needed for recording)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  // Use extracted hooks
  const { followPosition, followRotation, onFollowTransformUpdate } = useTFFollow()

  const recording = usePointCloudRecording({
    canvasRef,
    rendererRef,
    settings: {
      fps: settings.recording.fps,
      codec: settings.recording.codec,
      bitrate: settings.recording.bitrate
    }
  })

  usePerformanceMonitor()

  const handleConnectionChange = useCallback((isConnected: boolean, err: string | null) => {
    setConnected(isConnected)
    setError(err)
  }, [])

  return (
    <div className="relative w-full h-full min-h-[100px] bg-black/5 dark:bg-black/20 overflow-hidden">
      {/* Topic Info */}
      <PointCloudInfo topic={topic} pointCount={pointCount} />

      {/* Control Buttons */}
      <PointCloudControls
        cameraFollowEnabled={cameraFollowEnabled}
        onCameraFollowToggle={() => setCameraFollowEnabled(prev => !prev)}
        cameraAngleLockEnabled={cameraAngleLockEnabled}
        onCameraAngleLockToggle={() => setCameraAngleLockEnabled(prev => !prev)}
        tfVisible={tfVisible}
        onTfVisibleToggle={() => setTfVisible(prev => !prev)}
        latestScanHighlightEnabled={latestScanHighlightEnabled}
        latestScanMode={settings.pointcloud.latestScanMode}
        onLatestScanHighlightToggle={() => setLatestScanHighlightEnabled(prev => !prev)}
        onClear={() => setClearTrigger(prev => prev + 1)}
        isRecording={recording.isRecording}
        onRecordingToggle={recording.toggleRecording}
        recordingCodec={settings.recording.codec}
        recordingFps={settings.recording.fps}
      />

      {/* Recording Indicators */}
      <RecordingIndicators
        isRecording={recording.isRecording}
        recordedFrameCount={recording.recordedFrameCount}
        codec={settings.recording.codec}
        fps={settings.recording.fps}
        bitrate={settings.recording.bitrate}
        isPreparingVideo={recording.isPreparingVideo}
        progress={recording.progress}
        processingPhase={recording.processingPhase}
      />

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="px-4 py-3 bg-destructive/10 border border-destructive rounded-md">
            <div className="text-sm text-destructive font-medium">Connection Error</div>
            <div className="text-xs text-destructive/80 mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {!connected && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex items-center gap-2 px-4 py-3 bg-background/90 backdrop-blur-sm rounded-md border">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Connecting to {topic}...</span>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 10], fov: settings.pointcloud.fov }}
        gl={{
          antialias: true, // Disable antialiasing for performance
          powerPreference: "high-performance",
          alpha: false,
          preserveDrawingBuffer: false, // Essential for recording - prevents flickering
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
        <CameraSetup fov={settings.pointcloud.fov} />

        <CameraFollowController
          enabled={cameraFollowEnabled}
          followPosition={followPosition}
          followRotation={followRotation}
          smoothing={settings.tf.follow.smoothing}
          lockAngle={cameraAngleLockEnabled}
        />

        {/* Ambient light for visibility */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 10]} intensity={0.5} />

        {/* Ground grid */}
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

        {/* TF Viewer */}
        <TFViewer
          topic={settings.tf.topic}
          enabled={settings.tf.enabled}
          visible={tfVisible}
          followFrameId={cameraFollowEnabled ? settings.tf.follow.frameId : undefined}
          onFollowTransformUpdate={
            cameraFollowEnabled
              ? onFollowTransformUpdate
              : undefined
          }
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
      </Canvas>
    </div>
  )
}
