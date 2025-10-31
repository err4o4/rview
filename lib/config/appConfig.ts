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
  decayTimeMs: number;
}

export interface CameraConfig {
  topic: string;
}

export interface StatsConfig {
  topic: string;
}

export interface NodesConfig {
  topic: string;
  startService: string;
  stopService: string;
  exclude: string[];
  launch: StartableNode[];
}

export interface RecorderConfig {
  topic: string;
  statusTopic: string;
  deleteService: string;
  startService: string;
  stopService: string;
  topics: string[];
}

export interface AppConfig {
  connection: ConnectionConfig;
  pointcloud: PointCloudConfig;
  camera: CameraConfig;
  stats: StatsConfig;
  nodes: NodesConfig;
  recorder: RecorderConfig;
}

// Import the config file - used as default config in useSettings hook
import configData from "../../config/app-config.json";

// Export the default configuration
export const appConfig: AppConfig = configData as AppConfig;
