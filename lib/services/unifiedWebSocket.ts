"use client";

import { WebSocketConnection } from "./webSocketConnection";
import { TopicManager, MessageType } from "./topicManager";
import { ServiceManager } from "./serviceManager";

// Re-export types for convenience
export type {
  RosNode,
  NodesMonitorMessage,
  RecordFile,
  RecordsMonitorMessage,
  PointCloudMessage,
  RecordingStatusMessage,
  SystemStatusMessage,
  TFMessage,
  TransformStamped,
  Transform,
} from "./topicManager";

export { MessageType } from "./topicManager";

export type {
  StopNodeRequest,
  StartNodeRequest,
  DeleteRecordingRequest,
  StartRecordingRequest,
  StopRecordingRequest
} from "./serviceManager";

// ============================= Unified WebSocket Service =============================

class UnifiedWebSocketService {
  private connection: WebSocketConnection;
  private topicManager: TopicManager;
  private serviceManager: ServiceManager;

  constructor() {
    this.connection = new WebSocketConnection();
    this.topicManager = new TopicManager(this.connection);
    this.serviceManager = new ServiceManager(this.connection);

    // Set up message handler
    this.connection.setMessageHandler((event) => this.handleMessage(event));
  }

  connect(): Promise<void> {
    return this.connection.connect();
  }

  disconnect(): void {
    this.connection.disconnect();
    this.topicManager.clear();
    this.serviceManager.clear();
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data);

        if (data.op === "advertise" && Array.isArray(data.channels)) {
          this.topicManager.handleAdvertise(data.channels);
        } else if (data.op === "advertiseServices" && Array.isArray(data.services)) {
          this.serviceManager.handleAdvertiseServices(data.services);
        }

        return;
      }

      const buffer = event.data instanceof Blob ? await event.data.arrayBuffer() : (event.data as ArrayBuffer);
      this.handleBinaryMessage(buffer);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  private handleBinaryMessage(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 1) return;

    const view = new DataView(buffer);
    const op = view.getUint8(0);

    if (op === 0x01) {
      // Message data (subscription)
      this.topicManager.handleBinaryMessage(buffer);
    } else if (op === 0x03) {
      // Service call response
      this.serviceManager.handleBinaryServiceCallResponse(buffer);
    }
  }

  subscribeTopic<T>(topic: string, messageType: MessageType, callback: (message: T) => void): () => void {
    return this.topicManager.subscribeTopic(topic, messageType, callback);
  }

  callService<TRequest, TResponse>(service: string, request: TRequest): Promise<TResponse> {
    return this.serviceManager.callService(service, request);
  }
}

export const unifiedWebSocket = new UnifiedWebSocketService();
