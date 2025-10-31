"use client";

import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg-serialization";
import { WebSocketConnection } from "./webSocketConnection";

// ============================= Types =============================

export enum MessageType {
  POINT_CLOUD = 'PointCloud2',
  NODES_MONITOR = 'NodesMonitor',
  RECORDS_MONITOR = 'RecordsMonitor',
  RECORDING_STATUS = 'RecordingStatus',
  SYSTEM_STATUS = 'SystemStatus',
  COMPRESSED_IMAGE = 'CompressedImage',
  IMAGE = 'Image'
}

export interface RosNode {
  name: string;
  pid: number;
}

export interface NodesMonitorMessage {
  stamp: { sec: number; nsec: number };
  count: number;
  nodes: RosNode[];
}

export interface RecordFile {
  name: string;
  size: string;
  created: { sec: number; nsec: number };
}

export interface RecordsMonitorMessage {
  stamp: { sec: number; nsec: number };
  count: number;
  files: RecordFile[];
}

export interface PointCloudMessage {
  timestamp: number;
  points: Float32Array;
}

export interface RecordingStatusMessage {
  stamp: { sec: number; nsec: number };
  recording: boolean;
  recording_time: { sec: number; nsec: number };
  filename: string;
  filesize: number;
  space_left: number;
}

export interface SystemStatusMessage {
  stamp: { sec: number; nsec: number };
  cpu_count: number;
  cpu_percent: number[];
  cpu_percent_avg: number;
  ram_total: number;
  ram_used: number;
  ram_available: number;
  ram_percent: number;
}

type ChannelInfo = {
  id: number;
  topic: string;
  encoding: string;
  schemaName?: string;
};

type TopicCallback<T> = (message: T) => void;

// ============================= Message Definitions =============================

const NODE_LIST_DEFINITION = `time stamp
int32 count
supervisor_msgs/NodeInfo[] nodes

===
MSG: supervisor_msgs/NodeInfo
string name
int32 pid`;

const FILE_RECORD_LIST_DEFINITION = `time stamp
int32 count
supervisor_msgs/FileRecord[] files

===
MSG: supervisor_msgs/FileRecord
string name
int64 size
time created`;

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

const RECORDING_STATUS_DEFINITION = `time stamp
bool recording
duration recording_time
string filename
int64 filesize
int64 space_left`;

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

const SYSTEM_STATUS_DEFINITION = `time stamp
int32 cpu_count
float32[] cpu_percent
float32 cpu_percent_avg
int64 ram_total
int64 ram_used
int64 ram_available
float32 ram_percent`;

// ============================= Topic Manager =============================

export class TopicManager {
  private connection: WebSocketConnection;
  private channels: Map<string, ChannelInfo> = new Map();
  private subscriptions: Map<number, string> = new Map();
  private callbacks: Map<string, Set<TopicCallback<any>>> = new Map();
  private topicTypes: Map<string, MessageType> = new Map();
  private nextSubscriptionId: number = 1;

  // Message readers
  private nodeListReader: MessageReader;
  private fileRecordListReader: MessageReader;
  private pointCloud2Reader: MessageReader;
  private recordingStatusReader: MessageReader;
  private imageReader: MessageReader;
  private compressedImageReader: MessageReader;
  private systemStatusReader: MessageReader;

  constructor(connection: WebSocketConnection) {
    this.connection = connection;

    // Initialize message readers
    const nodeListMsgDef = parse(NODE_LIST_DEFINITION);
    const fileRecordListMsgDef = parse(FILE_RECORD_LIST_DEFINITION);
    const pointCloud2MsgDef = parse(POINT_CLOUD2_DEFINITION);
    const recordingStatusMsgDef = parse(RECORDING_STATUS_DEFINITION);
    const imageMsgDef = parse(IMAGE_DEFINITION);
    const compressedImageMsgDef = parse(COMPRESSED_IMAGE_DEFINITION);
    const systemStatusMsgDef = parse(SYSTEM_STATUS_DEFINITION);

    this.nodeListReader = new MessageReader(nodeListMsgDef);
    this.fileRecordListReader = new MessageReader(fileRecordListMsgDef);
    this.pointCloud2Reader = new MessageReader(pointCloud2MsgDef);
    this.recordingStatusReader = new MessageReader(recordingStatusMsgDef);
    this.imageReader = new MessageReader(imageMsgDef);
    this.compressedImageReader = new MessageReader(compressedImageMsgDef);
    this.systemStatusReader = new MessageReader(systemStatusMsgDef);
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
        case MessageType.NODES_MONITOR:
          message = this.decodeNodesMessage(payload);
          break;
        case MessageType.RECORDS_MONITOR:
          message = this.decodeRecordsMessage(payload);
          break;
        case MessageType.RECORDING_STATUS:
          message = this.decodeRecordingStatusMessage(payload);
          break;
        case MessageType.SYSTEM_STATUS:
          message = this.decodeSystemStatusMessage(payload);
          break;
        case MessageType.COMPRESSED_IMAGE:
        case MessageType.IMAGE:
          message = this.decodeCompressedImage(payload);
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

    const points = this.extractXYZFromPointCloud2(message);

    return { timestamp: timestampNs, points };
  }

  private extractXYZFromPointCloud2(pc2: any): Float32Array {
    const { fields, is_bigendian, point_step, data } = pc2;

    const xf = fields.find((f: any) => f.name === "x");
    const yf = fields.find((f: any) => f.name === "y");
    const zf = fields.find((f: any) => f.name === "z");

    if (!xf || !yf || !zf) {
      throw new Error("PointCloud2: x/y/z fields not found");
    }

    const FLOAT32_DATATYPE = 7;
    if (xf.datatype !== FLOAT32_DATATYPE || yf.datatype !== FLOAT32_DATATYPE || zf.datatype !== FLOAT32_DATATYPE) {
      throw new Error("PointCloud2: expected FLOAT32 for x/y/z");
    }

    if (!point_step || !data?.length) return new Float32Array();

    const littleEndian = !is_bigendian;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const numPoints = Math.floor(data.byteLength / point_step);

    const out: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      const base = i * point_step;
      const x = view.getFloat32(base + xf.offset, littleEndian);
      const y = view.getFloat32(base + yf.offset, littleEndian);
      const z = view.getFloat32(base + zf.offset, littleEndian);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out.push(x, y, z);
      }
    }

    return new Float32Array(out);
  }

  private decodeNodesMessage(payload: ArrayBuffer): NodesMonitorMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.nodeListReader.readMessage(uint8Array) as any;

    return {
      stamp: message.stamp,
      count: message.count,
      nodes: message.nodes.map((node: any) => ({
        name: node.name,
        pid: node.pid,
      })),
    };
  }

  private decodeRecordsMessage(payload: ArrayBuffer): RecordsMonitorMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.fileRecordListReader.readMessage(uint8Array) as any;

    return {
      stamp: message.stamp,
      count: message.count,
      files: message.files.map((file: any) => ({
        name: file.name,
        size: file.size.toString(),
        created: file.created,
      })),
    };
  }

  private decodeRecordingStatusMessage(payload: ArrayBuffer): RecordingStatusMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.recordingStatusReader.readMessage(uint8Array) as any;

    return {
      stamp: message.stamp,
      recording: message.recording,
      recording_time: message.recording_time,
      filename: message.filename,
      filesize: Number(message.filesize),
      space_left: Number(message.space_left),
    };
  }

  private decodeSystemStatusMessage(payload: ArrayBuffer): SystemStatusMessage {
    const uint8Array = new Uint8Array(payload);
    const message = this.systemStatusReader.readMessage(uint8Array) as any;

    return {
      stamp: message.stamp,
      cpu_count: message.cpu_count,
      cpu_percent: Array.from(message.cpu_percent),
      cpu_percent_avg: message.cpu_percent_avg,
      ram_total: Number(message.ram_total),
      ram_used: Number(message.ram_used),
      ram_available: Number(message.ram_available),
      ram_percent: message.ram_percent,
    };
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
