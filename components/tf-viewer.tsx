"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type TFMessage, type TransformStamped } from "@/lib/services/unifiedWebSocket"
import { useSettings } from "@/lib/hooks/useSettings"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { createPositionSmoother, createRotationSmoother } from "./pointcloud-viewer/utils/smoothing"

interface TFViewerProps {
  topic: string
  enabled?: boolean
  visible?: boolean
  followFrameId?: string
  onFollowTransformUpdate?: (position: THREE.Vector3, rotation: THREE.Quaternion) => void
  showModel?: boolean
}

/**
 * Component to visualize TF transforms as coordinate frames (XYZ arrows) or GLB models
 * X = Red, Y = Green, Z = Blue (standard ROS visualization convention)
 */
interface FrameTransform {
  group: THREE.Group
  targetPosition: THREE.Vector3
  targetQuaternion: THREE.Quaternion
  positionSmootherRef: { current: ReturnType<typeof createPositionSmoother> }
  rotationSmootherRef: { current: ReturnType<typeof createRotationSmoother> }
}

export function TFViewer({
  topic,
  enabled = true,
  visible = true,
  followFrameId,
  onFollowTransformUpdate,
  showModel = false,
}: TFViewerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const transformsMapRef = useRef<Map<string, FrameTransform>>(new Map())
  const { settings } = useSettings()
  const arrowLength = settings.tf.arrowLength
  const arrowWidth = settings.tf.arrowWidth
  const [modelTemplate, setModelTemplate] = useState<THREE.Group | null>(null)
  const [modelLoading, setModelLoading] = useState(false)

  // TF Smoothing factor (separate from camera smoothing)
  // 0 = no smoothing (instant), higher values = more smoothing but more delay
  // Recommended: 0 (instant), 5-10 (light), 20-30 (medium), 50+ (heavy)
  const smoothingValue = settings.tf.smoothing || 0

  // Use refs to track current showModel and modelTemplate without causing callback recreation
  const showModelRef = useRef(showModel)
  const modelTemplateRef = useRef(modelTemplate)

  useEffect(() => {
    showModelRef.current = showModel
    modelTemplateRef.current = modelTemplate
  }, [showModel, modelTemplate])

  // Load GLB model
  useEffect(() => {
    if (!showModel || modelTemplate || modelLoading) return

    setModelLoading(true)
    const loader = new GLTFLoader()
    loader.load(
      '/wheatley.glb',
      (gltf) => {
        setModelTemplate(gltf.scene)
        setModelLoading(false)
      },
      undefined,
      (error) => {
        console.error('Error loading GLB model:', error)
        setModelLoading(false)
      }
    )
  }, [showModel, modelTemplate, modelLoading])

  // Subscribe to TF topic
  const handleMessage = useCallback((message: TFMessage) => {
    if (!groupRef.current) return

    // Process each transform in the message
    message.transforms.forEach((tf: TransformStamped) => {
      const frameId = tf.child_frame_id

      // Get or create coordinate frame group for this transform
      let frameTransform = transformsMapRef.current.get(frameId)

      if (!frameTransform) {
        const group = createCoordinateFrame(arrowLength, arrowWidth, showModelRef.current, modelTemplateRef.current)
        const targetPosition = new THREE.Vector3(
          tf.transform.translation.x,
          tf.transform.translation.y,
          tf.transform.translation.z
        )
        const targetQuaternion = new THREE.Quaternion(
          tf.transform.rotation.x,
          tf.transform.rotation.y,
          tf.transform.rotation.z,
          tf.transform.rotation.w
        )

        // Create smoothers with refs (same as CameraFollowController)
        const positionSmootherRef = { current: createPositionSmoother(smoothingValue) }
        const rotationSmootherRef = { current: createRotationSmoother(smoothingValue) }

        // Initialize smoothers with starting position/rotation
        positionSmootherRef.current.set(targetPosition)
        rotationSmootherRef.current.set(targetQuaternion)

        frameTransform = {
          group,
          targetPosition,
          targetQuaternion,
          positionSmootherRef,
          rotationSmootherRef
        }

        // Initialize position and rotation to target (no smoothing on first frame)
        group.position.copy(targetPosition)
        group.quaternion.copy(targetQuaternion)
        transformsMapRef.current.set(frameId, frameTransform)
        groupRef.current!.add(group)
      } else {
        // Update target transform for smoothing
        frameTransform.targetPosition.set(
          tf.transform.translation.x,
          tf.transform.translation.y,
          tf.transform.translation.z
        )
        frameTransform.targetQuaternion.set(
          tf.transform.rotation.x,
          tf.transform.rotation.y,
          tf.transform.rotation.z,
          tf.transform.rotation.w
        )
      }

      // If this is the frame we're following, notify parent (reuse stored values)
      if (followFrameId && frameId === followFrameId && onFollowTransformUpdate && frameTransform) {
        onFollowTransformUpdate(frameTransform.targetPosition, frameTransform.targetQuaternion)
      }
    })
  }, [arrowLength, arrowWidth, followFrameId, onFollowTransformUpdate])

  // Smooth interpolation of transforms each frame (same as CameraFollowController)
  useFrame(() => {
    if (!transformsMapRef.current.size) return

    transformsMapRef.current.forEach((frameTransform) => {
      const { group, targetPosition, targetQuaternion, positionSmootherRef, rotationSmootherRef } = frameTransform

      // Smooth the position (same pattern as CameraFollowController)
      const smoothedPos = smoothingValue === 0
        ? targetPosition
        : positionSmootherRef.current.smooth(targetPosition)

      // Smooth the rotation (same pattern as CameraFollowController)
      const smoothedRot = smoothingValue === 0
        ? targetQuaternion
        : rotationSmootherRef.current.smooth(targetQuaternion)

      // Update group transform
      group.position.copy(smoothedPos)
      group.quaternion.copy(smoothedRot)
    })
  })

  // Effect to recreate all frames when toggling between arrows and models
  useEffect(() => {
    if (!groupRef.current) return

    // Recreate all frames with new style (arrows/model)
    transformsMapRef.current.forEach((frameTransform) => {
      // Remove old group
      groupRef.current?.remove(frameTransform.group)

      // Create new group with current style
      const newGroup = createCoordinateFrame(arrowLength, arrowWidth, showModel, modelTemplate)

      // Copy position and rotation from old group to new group
      newGroup.position.copy(frameTransform.group.position)
      newGroup.quaternion.copy(frameTransform.group.quaternion)

      // Also update target position/quaternion to current position to prevent jumping
      frameTransform.targetPosition.copy(frameTransform.group.position)
      frameTransform.targetQuaternion.copy(frameTransform.group.quaternion)

      // Reset smoothers to current position to prevent jumping
      frameTransform.positionSmootherRef.current.set(frameTransform.group.position)
      frameTransform.rotationSmootherRef.current.set(frameTransform.group.quaternion)

      // Update the frame transform with new group
      frameTransform.group = newGroup

      // Add new group to scene
      groupRef.current?.add(newGroup)
    })
  }, [showModel, modelTemplate, arrowLength, arrowWidth])

  useRosTopic<TFMessage>({
    topic,
    messageType: MessageType.TF,
    enabled: enabled,
    onMessage: handleMessage,
  })

  // Update visibility when prop changes
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.visible = visible
    }
  }, [visible])

  // Cleanup old transforms that haven't been updated
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Could add logic here to remove stale transforms
      // For now, we keep all transforms
    }, 10000)

    return () => {
      clearInterval(cleanupInterval)
    }
  }, [])

  return <group ref={groupRef} rotation={[Math.PI / 2, Math.PI, 0]} visible={visible} />
}

/**
 * Creates a coordinate frame visualization with XYZ arrows or GLB model
 */
function createCoordinateFrame(
  length: number,
  width: number,
  showModel: boolean,
  modelTemplate: THREE.Group | null,
): THREE.Group {
  const group = new THREE.Group()

  if (showModel && modelTemplate) {
    // Clone the model template and add it to the group
    const modelClone = modelTemplate.clone()
    modelClone.scale.set(0.3, 0.3, 0.3)
    // Rotate 90 degrees around X axis
    //modelClone.rotation.x = Math.PI / 2
    modelClone.rotation.y = Math.PI / 2
    //modelClone.rotation.z = Math.PI
    group.add(modelClone)
  } else {
    // Create arrows for X, Y, Z axes
    // X axis - Red
    const xArrow = createArrow(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      length,
      0xff0000, // red
      width
    )
    group.add(xArrow)

    // Y axis - Green
    const yArrow = createArrow(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      length,
      0x00ff00, // green
      width
    )
    group.add(yArrow)

    // Z axis - Blue
    const zArrow = createArrow(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      length,
      0x0000ff, // blue
      width
    )
    group.add(zArrow)
  }

  return group
}

/**
 * Creates an arrow helper for axis visualization
 */
function createArrow(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  color: number,
  width: number
): THREE.ArrowHelper {
  const arrow = new THREE.ArrowHelper(
    direction,
    origin,
    length,
    color,
    length * 0.2, // head length (20% of total length)
    length * 0.15 // head width (15% of total length)
  )

  // Make the arrow line thicker
  if (arrow.line) {
    const lineMaterial = arrow.line.material as THREE.LineBasicMaterial
    lineMaterial.linewidth = width * 100 // Scale up for visibility
  }

  return arrow
}

