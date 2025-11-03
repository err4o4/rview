"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useRosTopic } from "@/lib/hooks/useRosTopic"
import { MessageType, type TFMessage, type TransformStamped } from "@/lib/services/unifiedWebSocket"
import { useSettings } from "@/lib/hooks/useSettings"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

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
export function TFViewer({
  topic,
  enabled = true,
  visible = true,
  followFrameId,
  onFollowTransformUpdate,
  showModel = false,
}: TFViewerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const transformsMapRef = useRef<Map<string, THREE.Group>>(new Map())
  const { settings } = useSettings()
  const arrowLength = settings.tf.arrowLength
  const arrowWidth = settings.tf.arrowWidth
  const [modelTemplate, setModelTemplate] = useState<THREE.Group | null>(null)
  const [modelLoading, setModelLoading] = useState(false)

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
      let frameGroup = transformsMapRef.current.get(frameId)

      if (!frameGroup) {
        frameGroup = createCoordinateFrame(arrowLength, arrowWidth, showModel, modelTemplate)
        transformsMapRef.current.set(frameId, frameGroup)
        groupRef.current!.add(frameGroup)
      }

      // Update transform
      updateFrameTransform(frameGroup, tf)

      // If this is the frame we're following, notify parent
      if (followFrameId && frameId === followFrameId && onFollowTransformUpdate) {
        const position = new THREE.Vector3(
          tf.transform.translation.x,
          tf.transform.translation.y,
          tf.transform.translation.z
        )
        const rotation = new THREE.Quaternion(
          tf.transform.rotation.x,
          tf.transform.rotation.y,
          tf.transform.rotation.z,
          tf.transform.rotation.w
        )
        onFollowTransformUpdate(position, rotation)
      }
    })
  }, [arrowLength, arrowWidth, followFrameId, onFollowTransformUpdate, showModel, modelTemplate])

  // Effect to recreate all frames when toggling between arrows and models
  useEffect(() => {
    if (!groupRef.current) return

    // Clear all existing frames and recreate them
    transformsMapRef.current.forEach((frameGroup) => {
      groupRef.current?.remove(frameGroup)
    })
    transformsMapRef.current.clear()
  }, [showModel, modelTemplate])

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

/**
 * Updates the position and rotation of a coordinate frame based on TF transform
 */
function updateFrameTransform(group: THREE.Group, tf: TransformStamped): void {
  // Set position
  group.position.set(
    tf.transform.translation.x,
    tf.transform.translation.y,
    tf.transform.translation.z
  )

  // Set rotation from quaternion
  group.quaternion.set(
    tf.transform.rotation.x,
    tf.transform.rotation.y,
    tf.transform.rotation.z,
    tf.transform.rotation.w
  )
}
