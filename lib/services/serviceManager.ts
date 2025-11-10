"use client";

import { parse } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg-serialization";
import { toast } from "sonner";
import { WebSocketConnection } from "./webSocketConnection";

// ============================= Types =============================

export interface KeyValue {
  key: string;
  value: string;
}

export interface NodeInfo {
  name: string;
  pid: number;
}

export interface CommandParams {
  // Node control params
  package?: string;
  launch_file?: string;
  args?: KeyValue[];
  node?: string;
  pid?: number;
  // Recording params
  topics?: string[];
  filename?: string;
}

export interface CommandData {
  // Node start data
  roslaunch_pid?: number;
  started_nodes?: NodeInfo[];
  // Recording data
  recording_filename?: string;
  recording_duration?: number;
  recording_size_bytes?: number;
}

export interface CommandRequest {
  action: string;
  params: CommandParams;
}

export interface CommandResponse {
  ok: boolean;
  message: string;
  data: CommandData;
}

type ServiceInfo = {
  id: number;
  name: string;
  type: string;
  requestSchema: string;
  responseSchema: string;
};

// ============================= Message Definitions =============================

const COMMAND_REQUEST_DEFINITION = `string action
ros_supervisor/CommandParams params

===
MSG: ros_supervisor/CommandParams
string package
string launch_file
ros_supervisor/KeyValue[] args
string node
int32 pid
string[] topics
string filename

===
MSG: ros_supervisor/KeyValue
string key
string value`;

const COMMAND_RESPONSE_DEFINITION = `bool ok
string message
ros_supervisor/CommandData data

===
MSG: ros_supervisor/CommandData
int32 roslaunch_pid
ros_supervisor/NodeInfo[] started_nodes
string recording_filename
float64 recording_duration
int64 recording_size_bytes

===
MSG: ros_supervisor/NodeInfo
string name
int32 pid`;

// ============================= Service Manager =============================

export class ServiceManager {
  private connection: WebSocketConnection;
  private services: Map<string, ServiceInfo> = new Map();
  private nextServiceCallId: number = 1;
  private serviceCalls: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();

  // Message readers/writers
  private commandRequestWriter: MessageWriter;
  private commandResponseReader: MessageReader;

  constructor(connection: WebSocketConnection) {
    this.connection = connection;

    // Initialize message readers and writers
    const commandRequestMsgDef = parse(COMMAND_REQUEST_DEFINITION);
    const commandResponseMsgDef = parse(COMMAND_RESPONSE_DEFINITION);

    this.commandRequestWriter = new MessageWriter(commandRequestMsgDef);
    this.commandResponseReader = new MessageReader(commandResponseMsgDef);
  }

  handleAdvertiseServices(services: any[]): void {
    for (const service of services) {
      this.services.set(service.name, {
        id: service.id,
        name: service.name,
        type: service.type,
        requestSchema: service.requestSchema || "",
        responseSchema: service.responseSchema || "",
      });
    }
  }

  handleBinaryServiceCallResponse(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 9) return;

    const view = new DataView(buffer);
    const serviceId = view.getUint32(1, true);
    const callId = view.getUint32(5, true);
    const encodingLen = view.getUint32(9, true);

    let offset = 13;
    const encoding = new TextDecoder().decode(new Uint8Array(buffer, offset, encodingLen));
    offset += encodingLen;

    const payload = new Uint8Array(buffer, offset);

    const pending = this.serviceCalls.get(callId);
    if (!pending) return;

    this.serviceCalls.delete(callId);

    try {
      let response: any;

      if (encoding === "json") {
        const responseData = new TextDecoder().decode(payload);
        response = JSON.parse(responseData);
      } else if (encoding === "ros1" || encoding === "cdr") {
        // Decode based on service type
        const service = Array.from(this.services.values()).find(s => s.id === serviceId);

        if (service?.name.includes("supervisor/command")) {
          // Unified Command service
          const rawResponse = this.commandResponseReader.readMessage(payload) as any;
          response = {
            ok: rawResponse.ok,
            message: rawResponse.message,
            data: {
              roslaunch_pid: rawResponse.data?.roslaunch_pid,
              started_nodes: rawResponse.data?.started_nodes?.map((node: any) => ({
                name: node.name,
                pid: node.pid,
              })),
              recording_filename: rawResponse.data?.recording_filename,
              recording_duration: rawResponse.data?.recording_duration,
              recording_size_bytes: Number(rawResponse.data?.recording_size_bytes),
            },
          };
        } else {
          throw new Error(`Unknown service: ${service?.name}`);
        }
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }

      if (response && !response.ok && response.message) {
        toast.error(response.message);
      }

      pending.resolve(response);
    } catch (error) {
      pending.reject(error as Error);
    }
  }

  callService<TRequest, TResponse>(service: string, request: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.connection.isConnected()) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const serviceInfo = this.services.get(service);
      if (!serviceInfo) {
        reject(new Error(`Service not found: ${service}`));
        return;
      }

      const callId = this.nextServiceCallId++;
      this.serviceCalls.set(callId, { resolve, reject });

      const requestData = JSON.stringify(request);
      const requestBytes = new TextEncoder().encode(requestData);
      const encodingBytes = new TextEncoder().encode("json");

      const headerSize = 1 + 4 + 4 + 4 + encodingBytes.length;
      const totalSize = headerSize + requestBytes.length;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      let offset = 0;

      // op: callService (0x02)
      view.setUint8(offset, 0x02);
      offset += 1;

      // serviceId
      view.setUint32(offset, serviceInfo.id, true);
      offset += 4;

      // callId
      view.setUint32(offset, callId, true);
      offset += 4;

      // encoding length + encoding
      view.setUint32(offset, encodingBytes.length, true);
      offset += 4;
      bytes.set(encodingBytes, offset);
      offset += encodingBytes.length;

      // request payload
      bytes.set(requestBytes, offset);

      this.connection.send(buffer);

      setTimeout(() => {
        if (this.serviceCalls.has(callId)) {
          this.serviceCalls.delete(callId);
          reject(new Error("Service call timeout"));
        }
      }, 5000);
    });
  }

  callCommand(action: string, params: CommandParams = {}): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      if (!this.connection.isConnected()) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      // Look up unified command service
      const serviceInfo = this.services.get("/supervisor/command");
      if (!serviceInfo) {
        reject(new Error("Unified command service not found"));
        return;
      }

      const callId = this.nextServiceCallId++;
      this.serviceCalls.set(callId, { resolve, reject });

      // Build request with default values for all fields
      const request = {
        action,
        params: {
          package: params.package || "",
          launch_file: params.launch_file || "",
          args: params.args || [],
          node: params.node || "",
          pid: params.pid || 0,
          topics: params.topics || [],
          filename: params.filename || "",
        },
      };

      // Encode request using MessageWriter
      const requestPayload = this.commandRequestWriter.writeMessage(request);

      // Build binary service call message (Foxglove protocol)
      // Format: op(1) + serviceId(4) + callId(4) + encodingLen(4) + encoding + payload
      const encoder = new TextEncoder();
      const encodingBytes = encoder.encode("ros1");

      const headerSize = 1 + 4 + 4 + 4 + encodingBytes.length;
      const totalSize = headerSize + requestPayload.byteLength;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      let offset = 0;

      // op: callService (0x02)
      view.setUint8(offset, 0x02);
      offset += 1;

      // serviceId
      view.setUint32(offset, serviceInfo.id, true);
      offset += 4;

      // callId
      view.setUint32(offset, callId, true);
      offset += 4;

      // encoding length + encoding
      view.setUint32(offset, encodingBytes.length, true);
      offset += 4;
      bytes.set(encodingBytes, offset);
      offset += encodingBytes.length;

      // request payload
      bytes.set(requestPayload, offset);

      this.connection.send(buffer);

      setTimeout(() => {
        if (this.serviceCalls.has(callId)) {
          this.serviceCalls.delete(callId);
          reject(new Error("Service call timeout"));
        }
      }, 5000);
    });
  }

  clear(): void {
    this.services.clear();
    this.serviceCalls.clear();
  }
}
