/**
 * Point Cloud Viewer
 *
 * A comprehensive 3D point cloud visualization component for ROS data.
 * Features include TF frame following, camera controls, recording, and more.
 *
 * Refactored structure:
 * - /utils - Pure utility functions (coordinate transforms, smoothing, buffer optimization)
 * - /shaders - WebGL shader code for point rendering
 * - /hooks - Custom React hooks for state management
 * - /components - Reusable UI and 3D components
 */

// Re-export the main component
// Note: The main PointCloudViewer component still lives in the parent directory
// as pointcloud-viewer.tsx. It will be migrated here in a future update.
export { PointCloudViewer } from "../pointcloud-viewer"

// Export hooks for advanced usage
export { usePerformanceMonitor } from "./hooks/usePerformanceMonitor"
export { usePointCloudFrames } from "./hooks/usePointCloudFrames"
export { usePointCloudGeometry } from "./hooks/usePointCloudGeometry"
export { useTFFollow } from "./hooks/useTFFollow"
export { usePointCloudRecording } from "./hooks/usePointCloudRecording"
export type { ProcessingPhase } from "./hooks/usePointCloudRecording"

// Export utilities
export * from "./utils/coordinateTransforms"
export * from "./utils/smoothing"
export * from "./utils/bufferOptimization"

// Export shader utilities
export * from "./shaders/distanceScaling"

// Export components
export { PointCloudInfo } from "./components/PointCloudInfo"
export { RecordingIndicators } from "./components/RecordingIndicators"
export { PointCloudControls } from "./components/PointCloudControls"
export { CameraSetup } from "./components/CameraSetup"
export { CameraFollowController } from "./components/CameraFollowController"
