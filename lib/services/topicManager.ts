"use client";

import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg-serialization";
import { WebSocketConnection } from "./webSocketConnection";

// ============================= Types =============================

export enum MessageType {
  POINT_CLOUD = 'PointCloud2',
  COMPRESSED_IMAGE = 'CompressedImage',
  IMAGE = 'Image',
  TF = 'TFMessage',
  SUPERVISOR_STATUS = 'SupervisorStatus',
  PATH = 'Path'
}

export interface RosNode {
  name: string;
  pid: number;
}

export interface PointCloudMessage {
  timestamp: number;
  points: Float32Array;
  colors?: Float32Array; // RGB colors (0-1 range), 3 values per point
}

export interface Transform {
  translation: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

export interface TransformStamped {
  header: {
    seq: number;
    stamp: { sec: number; nsec: number };
    frame_id: string;
  };
  child_frame_id: string;
  transform: Transform;
}

export interface TFMessage {
  transforms: TransformStamped[];
}

export interface PoseStamped {
  header: {
    seq: number;
    stamp: { sec: number; nsec: number };
    frame_id: string;
  };
  pose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  };
}

export interface PathMessage {
  header: {
    seq: number;
    stamp: { sec: number; nsec: number };
    frame_id: string;
  };
  poses: PoseStamped[];
}

// ============================= Unified Supervisor Status Types =============================

export interface CpuStatus {
  count: number;
  percent_avg: number;
  percent_per_core: number[];
}

export interface RamStatus {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent: number;
}

export interface StorageStatus {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent: number;
}

export interface SystemResources {
  cpu: CpuStatus;
  ram: RamStatus;
  storage: StorageStatus;
}

export interface RecordingStatusNew {
  is_recording: boolean;
  filename: string;
  recording_time: { sec: number; nsec: number };
  size_bytes: number;
  topics: string[];
}

export interface NodesStatus {
  count: number;
  list: RosNode[];
}

export interface RecordingFile {
  name: string;
  size_bytes: number;
  created: { sec: number; nsec: number };
}

export interface RecordingsStatus {
  count: number;
  total_size_bytes: number;
  list: RecordingFile[];
}

export interface SupervisorHealth {
  uptime: { sec: number; nsec: number };
  version: string;
  healthy: boolean;
}

export interface SupervisorStatusMessage {
  stamp: { sec: number; nsec: number };
  system: SystemResources;
  recording: RecordingStatusNew;
  nodes: NodesStatus;
  recordings: RecordingsStatus;
  supervisor: SupervisorHealth;
}

type ChannelInfo = {
  id: number;
  topic: string;
  encoding: string;
  schemaName?: string;
};

type TopicCallback<T> = (message: T) => void;

// ============================= Message Definitions =============================

const POINT_CLOUD2_DEFINITION = `std_msgs/Header header
uint32 height
uint32 width
sensor_msgs/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense

===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

===
MSG: sensor_msgs/PointField
string name
uint32 offset
uint8 datatype
uint32 count`;

const IMAGE_DEFINITION = `std_msgs/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data

===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

const COMPRESSED_IMAGE_DEFINITION = `std_msgs/Header header
string format
uint8[] data

===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

const TF_MESSAGE_DEFINITION = `geometry_msgs/TransformStamped[] transforms

===
MSG: geometry_msgs/TransformStamped
std_msgs/Header header
string child_frame_id
geometry_msgs/Transform transform

===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

===
MSG: geometry_msgs/Transform
geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation

===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z

===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const PATH_MESSAGE_DEFINITION = `std_msgs/Header header
geometry_msgs/PoseStamped[] poses

===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

===
MSG: geometry_msgs/PoseStamped
std_msgs/Header header
geometry_msgs/Pose pose

===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation

===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const SUPERVISOR_STATUS_DEFINITION = `time stamp
ros_supervisor/SystemResources system
ros_supervisor/RecordingStatusNew recording
ros_supervisor/NodesStatus nodes
ros_supervisor/RecordingsStatus recordings
ros_supervisor/SupervisorHealth supervisor

===
MSG: ros_supervisor/SystemResources
ros_supervisor/CpuStatus cpu
ros_supervisor/RamStatus ram
ros_supervisor/StorageStatus storage

===
MSG: ros_supervisor/CpuStatus
int32 count
float32 percent_avg
float32[] percent_per_core

===
MSG: ros_supervisor/RamStatus
int64 total_bytes
int64 used_bytes
int64 available_bytes
float32 percent

===
MSG: ros_supervisor/StorageStatus
int64 total_bytes
int64 used_bytes
int64 available_bytes
float32 percent

===
MSG: ros_supervisor/RecordingStatusNew
bool is_recording
string filename
duration recording_time
int64 size_bytes
string[] topics

===
MSG: ros_supervisor/NodesStatus
int32 count
ros_supervisor/NodeInfo[] list

===
MSG: ros_supervisor/NodeInfo
string name
int32 pid

===
MSG: ros_supervisor/RecordingsStatus
int32 count
int64 total_size_bytes
ros_supervisor/RecordingFile[] list

===
MSG: ros_supervisor/RecordingFile
string name
int64 size_bytes
time created

===
MSG: ros_supervisor/SupervisorHealth
duration uptime
string version
bool healthy`;

// ============================= Topic Manager =============================

export class TopicManager {
  private connection: WebSocketConnection;
  private channels: Map<string, ChannelInfo> = new Map();
  private subscriptions: Map<number, string> = new Map();
  private callbacks: Map<string, Set<TopicCallback<any>>> = new Map();
  private topicTypes: Map<string, MessageType> = new Map();
  private nextSubscriptionId: number = 1;
  private colorMode: "intensity" | "rgb" = "intensity";

  // Message readers
  private pointCloud2Reader: MessageReader;
  private imageReader: MessageReader;
  private compressedImageReader: MessageReader;
  private tfMessageReader: MessageReader;
  private supervisorStatusReader: MessageReader;
  private pathMessageReader: MessageReader;

  constructor(connection: WebSocketConnection) {
    this.connection = connection;

    // Initialize message readers
    const pointCloud2MsgDef = parse(POINT_CLOUD2_DEFINITION);
    const imageMsgDef = parse(IMAGE_DEFINITION);
    const compressedImageMsgDef = parse(COMPRESSED_IMAGE_DEFINITION);
    const tfMessageMsgDef = parse(TF_MESSAGE_DEFINITION);
    const supervisorStatusMsgDef = parse(SUPERVISOR_STATUS_DEFINITION);
    const pathMessageMsgDef = parse(PATH_MESSAGE_DEFINITION);

    this.pointCloud2Reader = new MessageReader(pointCloud2MsgDef);
    this.imageReader = new MessageReader(imageMsgDef);
    this.compressedImageReader = new MessageReader(compressedImageMsgDef);
    this.tfMessageReader = new MessageReader(tfMessageMsgDef);
    this.supervisorStatusReader = new MessageReader(supervisorStatusMsgDef);
    this.pathMessageReader = new MessageReader(pathMessageMsgDef);
  }

  setColorMode(mode: "intensity" | "rgb"): void {
    this.colorMode = mode;
  }

  handleAdvertise(channels: any[]): void {
    for (const channel of channels) {
      this.channels.set(channel.topic, {
        id: channel.id,
        topic: channel.topic,
        encoding: channel.encoding,
        schemaName: channel.schemaName,
      });
    }

    for (const topic of this.callbacks.keys()) {
      if (this.channels.has(topic)) {
        this.subscribeToChannel(topic);
      }
    }
  }

  private subscribeToChannel(topic: string): void {
    const channel = this.channels.get(topic);
    if (!channel) return;

    const subscriptionId = this.nextSubscriptionId++;
    this.subscriptions.set(subscriptionId, topic);

    this.connection.send(
      JSON.stringify({
        op: "subscribe",
        subscriptions: [{ id: subscriptionId, channelId: channel.id }],
      })
    );
  }

  handleBinaryMessage(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 13) return;

    const view = new DataView(buffer);
    const subscriptionId = view.getUint32(1, true);
    const timestampNs = Number(view.getBigUint64(5, true));
    const payload = buffer.slice(13);

    const topic = this.subscriptions.get(subscriptionId);
    if (!topic) return;

    const channel = this.channels.get(topic);
    if (!channel) return;

    this.decodeAndNotify(topic, channel, payload, timestampNs);
  }

  private decodeAndNotify(topic: string, channel: ChannelInfo, payload: ArrayBuffer, timestampNs: number): void {
    try {
      const messageType = this.topicTypes.get(topic);

      if (!messageType) {
        console.warn('No message type registered for topic:', topic, 'schema:', channel.schemaName);
        return;
      }

      let message: any;

      switch (messageType) {
        case MessageType.POINT_CLOUD:
          message = this.decodePointCloud(payload, timestampNs);
          break;
        case MessageType.COMPRESSED_IMAGE:
        case MessageType.IMAGE:
          message = this.decodeCompressedImage(payload);
          break;
        case MessageType.TF:
          message = this.decodeTFMessage(payload);
          break;
        case MessageType.SUPERVISOR_STATUS:
          message = this.decodeSupervisorStatusMessage(payload);
          break;
        case MessageType.PATH:
          message = this.decodePathMessage(payload);
          break;
        default:
          console.warn('Unknown message type:', messageType, 'for topic:', topic);
          return;
      }

      const callbacks = this.callbacks.get(topic);
      if (callbacks) {
        callbacks.forEach((callback) => callback(message));
      }
    } catch (error) {
      console.error(`Error decoding message for topic ${topic}:`, error);
    }
  }

  private decodePointCloud(payload: ArrayBuffer, timestampNs: number): PointCloudMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.pointCloud2Reader.readMessage(uint8Array) as any;

    const { points, colors } = this.extractXYZAndColorsFromPointCloud2(message);

    return { timestamp: timestampNs, points, colors };
  }

  private extractXYZAndColorsFromPointCloud2(pc2: any): { points: Float32Array; colors?: Float32Array } {
    const { fields, is_bigendian, point_step, data } = pc2;

    const xf = fields.find((f: any) => f.name === "x");
    const yf = fields.find((f: any) => f.name === "y");
    const zf = fields.find((f: any) => f.name === "z");
    const intensityf = fields.find((f: any) => f.name === "intensity");
    const rgbf = fields.find((f: any) => f.name === "rgb");

    if (!xf || !yf || !zf) {
      throw new Error("PointCloud2: x/y/z fields not found");
    }

    const FLOAT32_DATATYPE = 7;
    if (xf.datatype !== FLOAT32_DATATYPE || yf.datatype !== FLOAT32_DATATYPE || zf.datatype !== FLOAT32_DATATYPE) {
      throw new Error("PointCloud2: expected FLOAT32 for x/y/z");
    }

    if (!point_step || !data?.length) return { points: new Float32Array() };

    const littleEndian = !is_bigendian;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const numPoints = Math.floor(data.byteLength / point_step);

    const points: number[] = [];
    const intensities: number[] = [];
    const rgbColors: number[] = [];
    let minIntensity = Infinity;
    let maxIntensity = -Infinity;

    for (let i = 0; i < numPoints; i++) {
      const base = i * point_step;
      const x = view.getFloat32(base + xf.offset, littleEndian);
      const y = view.getFloat32(base + yf.offset, littleEndian);
      const z = view.getFloat32(base + zf.offset, littleEndian);

      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        points.push(x, y, z);

        // Extract RGB if available and in RGB mode
        if (this.colorMode === "rgb" && rgbf) {
          // Read the RGB field directly as uint32 to avoid float reinterpretation issues
          const rgbPacked = view.getUint32(base + rgbf.offset, littleEndian);

          // ROS PointCloud2 packs RGB as bytes in memory order: B, G, R, A (or padding)
          // When read as little-endian uint32: [B, G, R, A] -> 0xAARRGGBB
          const b = (rgbPacked & 0xFF) / 255.0;          // Byte 0: Blue
          const g = ((rgbPacked >> 8) & 0xFF) / 255.0;   // Byte 1: Green
          const r = ((rgbPacked >> 16) & 0xFF) / 255.0;  // Byte 2: Red

          rgbColors.push(r, g, b);
        }
        // Extract intensity if available and in intensity mode
        else if (this.colorMode === "intensity" && intensityf) {
          let intensity = 0;
          if (intensityf.datatype === FLOAT32_DATATYPE) {
            intensity = view.getFloat32(base + intensityf.offset, littleEndian);
          } else if (intensityf.datatype === 2) { // UINT8
            intensity = view.getUint8(base + intensityf.offset) / 255.0;
          } else if (intensityf.datatype === 4) { // UINT16
            intensity = view.getUint16(base + intensityf.offset, littleEndian) / 65535.0;
          }

          intensities.push(intensity);
          minIntensity = Math.min(minIntensity, intensity);
          maxIntensity = Math.max(maxIntensity, intensity);
        }
      }
    }

    // Return RGB colors if in RGB mode
    let colors: Float32Array | undefined;
    if (this.colorMode === "rgb" && rgbColors.length > 0) {
      colors = new Float32Array(rgbColors);
    }
    // Convert intensities to colors using turbo colormap if in intensity mode
    else if (this.colorMode === "intensity" && intensities.length > 0 && maxIntensity > minIntensity) {
      const colorArray: number[] = [];
      for (const intensity of intensities) {
        // Normalize intensity to 0-1 range
        const normalized = (intensity - minIntensity) / (maxIntensity - minIntensity);
        const rgb = this.turboColormap(normalized);
        colorArray.push(rgb[0], rgb[1], rgb[2]);
      }
      colors = new Float32Array(colorArray);
    }

    return { points: new Float32Array(points), colors };
  }

  // Turbo colormap implementation with reduced brightness
  // Based on https://ai.googleblog.com/2019/08/turbo-improved-rainbow-colormap-for.html
  private turboColormap(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));

    let r = Math.max(0, Math.min(1,
      0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))
    ));

    let g = Math.max(0, Math.min(1,
      0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))
    ));

    let b = Math.max(0, Math.min(1,
      0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))
    ));

    // Reduce brightness by applying tone mapping
    // Scale down bright colors to make them less intense
    const brightness = 0.7; // Reduce overall brightness to 70%
    r *= brightness;
    g *= brightness;
    b *= brightness;

    return [r, g, b];
  }

  private decodeCompressedImage(payload: ArrayBuffer): any {
    const uint8Array = new Uint8Array(payload);

    try {
      // Try to decode as CompressedImage first
      const compressedMsg = this.compressedImageReader.readMessage(uint8Array) as any;

      if (compressedMsg.format && compressedMsg.data) {
        // Extract format from string like "jpeg" or "bgr8; jpeg compressed bgr8"
        let format = 'jpeg';
        if (compressedMsg.format.includes('png')) {
          format = 'png';
        }

        return {
          data: compressedMsg.data,
          format: format
        };
      }
    } catch (e) {
      // Not a compressed image, try regular Image
      try {
        const imageMsg = this.imageReader.readMessage(uint8Array) as any;

        if (imageMsg.data && imageMsg.encoding) {
          // For uncompressed images, we need to convert to displayable format
          return {
            data: imageMsg.data,
            width: imageMsg.width,
            height: imageMsg.height,
            encoding: imageMsg.encoding,
            step: imageMsg.step
          };
        }
      } catch (e2) {
        console.error('Failed to decode image:', e2);
      }
    }

    return null;
  }

  private decodeTFMessage(payload: ArrayBuffer): TFMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.tfMessageReader.readMessage(uint8Array) as any;

    return {
      transforms: message.transforms.map((tf: any) => ({
        header: {
          seq: tf.header.seq,
          stamp: tf.header.stamp,
          frame_id: tf.header.frame_id,
        },
        child_frame_id: tf.child_frame_id,
        transform: {
          translation: {
            x: tf.transform.translation.x,
            y: tf.transform.translation.y,
            z: tf.transform.translation.z,
          },
          rotation: {
            x: tf.transform.rotation.x,
            y: tf.transform.rotation.y,
            z: tf.transform.rotation.z,
            w: tf.transform.rotation.w,
          },
        },
      })),
    };
  }

  private decodeSupervisorStatusMessage(payload: ArrayBuffer): SupervisorStatusMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.supervisorStatusReader.readMessage(uint8Array) as any;

    return {
      stamp: message.stamp,
      system: {
        cpu: {
          count: message.system.cpu.count,
          percent_avg: message.system.cpu.percent_avg,
          percent_per_core: Array.from(message.system.cpu.percent_per_core),
        },
        ram: {
          total_bytes: Number(message.system.ram.total_bytes),
          used_bytes: Number(message.system.ram.used_bytes),
          available_bytes: Number(message.system.ram.available_bytes),
          percent: message.system.ram.percent,
        },
        storage: {
          total_bytes: Number(message.system.storage.total_bytes),
          used_bytes: Number(message.system.storage.used_bytes),
          available_bytes: Number(message.system.storage.available_bytes),
          percent: message.system.storage.percent,
        },
      },
      recording: {
        is_recording: message.recording.is_recording,
        filename: message.recording.filename,
        recording_time: message.recording.recording_time,
        size_bytes: Number(message.recording.size_bytes),
        topics: Array.from(message.recording.topics),
      },
      nodes: {
        count: message.nodes.count,
        list: message.nodes.list.map((node: any) => ({
          name: node.name,
          pid: node.pid,
        })),
      },
      recordings: {
        count: message.recordings.count,
        total_size_bytes: Number(message.recordings.total_size_bytes),
        list: message.recordings.list.map((file: any) => ({
          name: file.name,
          size_bytes: Number(file.size_bytes),
          created: file.created,
        })),
      },
      supervisor: {
        uptime: message.supervisor.uptime,
        version: message.supervisor.version,
        healthy: message.supervisor.healthy,
      },
    };
  }

  private decodePathMessage(payload: ArrayBuffer): PathMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.pathMessageReader.readMessage(uint8Array) as any;

    return {
      header: {
        seq: message.header.seq,
        stamp: message.header.stamp,
        frame_id: message.header.frame_id,
      },
      poses: message.poses.map((pose: any) => ({
        header: {
          seq: pose.header.seq,
          stamp: pose.header.stamp,
          frame_id: pose.header.frame_id,
        },
        pose: {
          position: {
            x: pose.pose.position.x,
            y: pose.pose.position.y,
            z: pose.pose.position.z,
          },
          orientation: {
            x: pose.pose.orientation.x,
            y: pose.pose.orientation.y,
            z: pose.pose.orientation.z,
            w: pose.pose.orientation.w,
          },
        },
      })),
    };
  }

  subscribeTopic<T>(topic: string, messageType: MessageType, callback: TopicCallback<T>): () => void {
    // Register the message type for this topic
    this.topicTypes.set(topic, messageType);

    if (!this.callbacks.has(topic)) {
      this.callbacks.set(topic, new Set());
    }
    this.callbacks.get(topic)!.add(callback);

    if (this.connection.isConnected() && this.channels.has(topic)) {
      this.subscribeToChannel(topic);
    }

    return () => {
      const callbacks = this.callbacks.get(topic);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.callbacks.delete(topic);
          this.topicTypes.delete(topic);
        }
      }
    };
  }

  clear(): void {
    this.channels.clear();
    this.subscriptions.clear();
    this.topicTypes.clear();
  }
}
