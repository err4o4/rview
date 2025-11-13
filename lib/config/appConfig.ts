export interface NodeArg {
  key: string;
  value: string;
}

export interface StartableNode {
  package: string;
  launchFile: string;
  args: NodeArg[];
}

export interface ConnectionConfig {
  url: string;
}

export interface PointCloudConfig {
  topic: string;
  decayTimeSeconds: number; // Time in seconds before points fade out (0 = infinite)
  maxPoints: number; // Maximum number of points to render (for performance)
  pointFilterNumber: number; // Downsample ratio (0.2 = keep 20%, 1 = keep all)
  pointSize: number; // Size of each point in pixels
  latestScanPointSize: number; // Size of latest scan points in pixels
  latestScanMode: "brighter" | "brighter-red"; // How to highlight latest scan
  fov: number; // Camera field of view in degrees
  dynamicLatestPointScaling: boolean; // Scale latest scan points based on camera distance
  colorMode: "intensity" | "rgb"; // Color mode: intensity (turbo colormap) or rgb (from point cloud data)
}

export interface CameraConfig {
  topic: string;
}

export interface TFConfig {
  topic: string;
  arrowLength: number; // Length of coordinate frame arrows
  arrowWidth: number; // Width of coordinate frame arrows
  smoothing: number; // TF Smoothing (0 = instant, higher = smoother but slower)
  follow: {
    frameId: string; // Which TF frame to follow (e.g., "base_link")
    smoothing: number; // Camera follow smoothing factor (0 = instant, higher = smoother but slower)
  };
}

export interface PathConfig {
  enabled: boolean; // Enable/disable path visualization
  topic: string; // Path topic (e.g., "/path")
  lineWidth: number; // Width of the path line
  color: string; // Color of the path line (hex format)
}

export interface SupervisorConfig {
  topic: string; // Unified status topic
  service: string; // Unified command service
}

export interface NodesConfig {
  exclude: string[];
  launch: StartableNode[];
}

export interface RecorderConfig {
  topics: string[];
}

export interface RecordingConfig {
  mode: "video" | "png-sequence"; // video = WebCodecs MP4, png-sequence = ZIP of PNG/JPEG
  fps: number; // Frame rate (15, 24, 30, 60)
  // Video mode settings
  codec: "h264" | "vp9"; // H.264/AVC (smaller, faster) or VP9 (better quality)
  bitrate: number; // Bitrate in Mbps (e.g., 10, 50, 100)
  // PNG-sequence mode settings
  format: "jpeg" | "png"; // JPEG (fast, lossy) or PNG (slow, lossless)
  quality: number; // JPEG quality 0.0-1.0 (0.95 recommended), ignored for PNG
}

export interface AppConfig {
  connection: ConnectionConfig;
  pointcloud: PointCloudConfig;
  camera: CameraConfig;
  tf: TFConfig;
  path: PathConfig;
  supervisor: SupervisorConfig;
  nodes: NodesConfig;
  recorder: RecorderConfig;
  recording: RecordingConfig;
}

// Import the config file - used as default config in useSettings hook
import configData from "../../config/app-config.json";

// Export the default configuration
export const appConfig: AppConfig = configData as AppConfig;
