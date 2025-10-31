"use client";

import { parse } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg-serialization";
import { toast } from "sonner";
import { WebSocketConnection } from "./webSocketConnection";

// ============================= Types =============================

export interface StopNodeRequest {
  node: string;
  pid: number;
}

export interface StartNodeRequest {
  package: string;
  launch_file: string;
  args: Array<{ key: string; value: string }>;
}

export interface DeleteRecordingRequest {
  filename: string;
}

export interface StartRecordingRequest {
  topics: string[];
}

export interface StopRecordingRequest {
  // Empty - no parameters
}

type ServiceInfo = {
  id: number;
  name: string;
  type: string;
  requestSchema: string;
  responseSchema: string;
};

// ============================= Message Definitions =============================

const STOP_NODE_REQUEST_DEFINITION = `string node
int32 pid`;

const STOP_NODE_RESPONSE_DEFINITION = `bool ok
string message
string error`;

const START_NODE_REQUEST_DEFINITION = `string package
string launch_file
supervisor_msgs/KeyValue[] args

===
MSG: supervisor_msgs/KeyValue
string key
string value`;

const START_NODE_RESPONSE_DEFINITION = `bool ok
int32 roslaunch_pid
supervisor_msgs/NodeInfo[] nodes


===
MSG: supervisor_msgs/NodeInfo
string name
int32 pid`;

const DELETE_RECORDING_REQUEST_DEFINITION = `string filename`;

const DELETE_RECORDING_RESPONSE_DEFINITION = `bool ok
string message
string error`;

const START_RECORDING_REQUEST_DEFINITION = `string[] topics`;

const START_RECORDING_RESPONSE_DEFINITION = `bool ok
string message
string error
string filename`;

const STOP_RECORDING_REQUEST_DEFINITION = ``;

const STOP_RECORDING_RESPONSE_DEFINITION = `bool ok
string message
string error
string filename`;

// ============================= Service Manager =============================

export class ServiceManager {
  private connection: WebSocketConnection;
  private services: Map<string, ServiceInfo> = new Map();
  private nextServiceCallId: number = 1;
  private serviceCalls: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();

  // Message readers/writers
  private stopNodeRequestWriter: MessageWriter;
  private stopNodeResponseReader: MessageReader;
  private startNodeRequestWriter: MessageWriter;
  private startNodeResponseReader: MessageReader;
  private deleteRecordingRequestWriter: MessageWriter;
  private deleteRecordingResponseReader: MessageReader;
  private startRecordingRequestWriter: MessageWriter;
  private startRecordingResponseReader: MessageReader;
  private stopRecordingResponseReader: MessageReader;

  constructor(connection: WebSocketConnection) {
    this.connection = connection;

    // Initialize message readers and writers
    const stopNodeRequestMsgDef = parse(STOP_NODE_REQUEST_DEFINITION);
    const stopNodeResponseMsgDef = parse(STOP_NODE_RESPONSE_DEFINITION);
    const startNodeRequestMsgDef = parse(START_NODE_REQUEST_DEFINITION);
    const startNodeResponseMsgDef = parse(START_NODE_RESPONSE_DEFINITION);
    const deleteRecordingRequestMsgDef = parse(DELETE_RECORDING_REQUEST_DEFINITION);
    const deleteRecordingResponseMsgDef = parse(DELETE_RECORDING_RESPONSE_DEFINITION);
    const startRecordingRequestMsgDef = parse(START_RECORDING_REQUEST_DEFINITION);
    const startRecordingResponseMsgDef = parse(START_RECORDING_RESPONSE_DEFINITION);
    const stopRecordingResponseMsgDef = parse(STOP_RECORDING_RESPONSE_DEFINITION);

    this.stopNodeRequestWriter = new MessageWriter(stopNodeRequestMsgDef);
    this.stopNodeResponseReader = new MessageReader(stopNodeResponseMsgDef);
    this.startNodeRequestWriter = new MessageWriter(startNodeRequestMsgDef);
    this.startNodeResponseReader = new MessageReader(startNodeResponseMsgDef);
    this.deleteRecordingRequestWriter = new MessageWriter(deleteRecordingRequestMsgDef);
    this.deleteRecordingResponseReader = new MessageReader(deleteRecordingResponseMsgDef);
    this.startRecordingRequestWriter = new MessageWriter(startRecordingRequestMsgDef);
    this.startRecordingResponseReader = new MessageReader(startRecordingResponseMsgDef);
    this.stopRecordingResponseReader = new MessageReader(stopRecordingResponseMsgDef);
  }

  handleAdvertiseServices(services: any[]): void {
    for (const service of services) {
      this.services.set(service.name, {
        id: service.id,
        name: service.name,
        type: service.type,
        requestSchema: service.requestSchema,
        responseSchema: service.responseSchema,
      });
    }
  }

  handleBinaryServiceCallResponse(buffer: ArrayBuffer): void {
    // Format: op(1) + serviceId(4) + callId(4) + encodingLen(4) + encoding + payload
    if (buffer.byteLength < 13) return;

    const view = new DataView(buffer);
    let offset = 1; // skip op

    const serviceId = view.getUint32(offset, true);
    offset += 4;

    const callId = view.getUint32(offset, true);
    offset += 4;

    const encodingLen = view.getUint32(offset, true);
    offset += 4;

    const encodingBytes = new Uint8Array(buffer.slice(offset, offset + encodingLen));
    const encoding = new TextDecoder().decode(encodingBytes);
    offset += encodingLen;

    const payload = new Uint8Array(buffer.slice(offset));

    const serviceCall = this.serviceCalls.get(callId);
    if (!serviceCall) return;

    this.serviceCalls.delete(callId);

    try {
      let response: any;

      if (encoding === "json") {
        const responseData = new TextDecoder().decode(payload);
        response = JSON.parse(responseData);
      } else if (encoding === "ros1" || encoding === "cdr") {
        // Decode based on service type
        // Determine which service based on serviceId
        const service = Array.from(this.services.values()).find(s => s.id === serviceId);

        if (service?.name.includes("stop_node")) {
          response = this.stopNodeResponseReader.readMessage(payload);
        } else if (service?.name.includes("start_node")) {
          response = this.startNodeResponseReader.readMessage(payload);
        } else if (service?.name.includes("delete_recording")) {
          response = this.deleteRecordingResponseReader.readMessage(payload);
        } else if (service?.name.includes("start_recording")) {
          response = this.startRecordingResponseReader.readMessage(payload);
        } else if (service?.name.includes("stop_recording")) {
          response = this.stopRecordingResponseReader.readMessage(payload);
        } else {
          // Default to stop_node reader for backward compatibility
          response = this.stopNodeResponseReader.readMessage(payload);
        }
      } else {
        serviceCall.reject(new Error(`Unsupported service response encoding: ${encoding}`));
        return;
      }

      // Show toast notification based on response
      if (response.ok) {
        toast.success(response.message || "Service call successful");
      } else {
        toast.error(response.error || response.message || "Service call failed");
      }

      serviceCall.resolve(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Service call failed: ${errorMessage}`);
      serviceCall.reject(error as Error);
    }
  }

  callService<TRequest, TResponse>(service: string, request: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.connection.isConnected()) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      // Look up service to get serviceId
      const serviceInfo = this.services.get(service);
      if (!serviceInfo) {
        reject(new Error(`Service not found: ${service}`));
        return;
      }

      const callId = this.nextServiceCallId++;
      this.serviceCalls.set(callId, { resolve, reject });

      // Encode request using MessageWriter
      let requestPayload: Uint8Array;

      if (service.includes("stop_node")) {
        const req = request as any;
        // Strip leading slash from node name if present
        const nodeName = req.node.startsWith('/') ? req.node.substring(1) : req.node;
        requestPayload = this.stopNodeRequestWriter.writeMessage({
          node: nodeName,
          pid: 0,  // Protocol expects PID to be 0
        });
      } else if (service.includes("start_node")) {
        const req = request as StartNodeRequest;
        requestPayload = this.startNodeRequestWriter.writeMessage({
          package: req.package,
          launch_file: req.launch_file,
          args: req.args,
        });
      } else if (service.includes("delete_recording")) {
        const req = request as DeleteRecordingRequest;
        requestPayload = this.deleteRecordingRequestWriter.writeMessage({
          filename: req.filename,
        });
      } else if (service.includes("start_recording")) {
        const req = request as StartRecordingRequest;
        requestPayload = this.startRecordingRequestWriter.writeMessage({
          topics: req.topics,
        });
      } else if (service.includes("stop_recording")) {
        // Stop recording has no request parameters - send empty message
        requestPayload = new Uint8Array(0);
      } else {
        // For other services, try JSON encoding as fallback
        const jsonStr = JSON.stringify(request);
        requestPayload = new TextEncoder().encode(jsonStr);
      }

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
