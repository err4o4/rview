"use client";

import { useState, useCallback } from "react";
import {
  unifiedWebSocket,
  MessageType,
  type RecordsMonitorMessage,
  type RecordFile,
  type DeleteRecordingRequest,
  type StartRecordingRequest,
  type StopRecordingRequest,
  type RecordingStatusMessage,
} from "../services/unifiedWebSocket";
import { useRosTopic } from "./useRosTopic";
import { useSettings } from "./useSettings";

export interface Recording {
  id: string;
  name: string;
  size: number;
  createdAt: Date;
}

export interface RecordingStatus {
  recording: boolean;
  recordingTime: number; // in seconds
  filename: string;
  filesize: number;
  spaceLeft: number;
}

function recordFileToRecording(file: RecordFile): Recording {
  return {
    id: file.name,
    name: file.name,
    size: parseInt(file.size, 10),
    createdAt: new Date(file.created.sec * 1000 + file.created.nsec / 1000000),
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDuration(sizeInBytes: number): string {
  const seconds = Math.floor(sizeInBytes / 1000000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function useRosRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    recording: false,
    recordingTime: 0,
    filename: "",
    filesize: 0,
    spaceLeft: 0,
  });
  const { settings } = useSettings();

  const handleRecordingsMessage = useCallback((message: RecordsMonitorMessage) => {
    if (!message.files || !Array.isArray(message.files)) {
      console.warn("Invalid recordings message format");
      return;
    }

    const convertedRecordings = message.files
      .filter((file) => file.name.endsWith(".bag") || file.name.endsWith(".bag.active"))
      .map(recordFileToRecording)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    setRecordings(convertedRecordings);
  }, []);

  const handleStatusMessage = useCallback((message: RecordingStatusMessage) => {
    setRecordingStatus({
      recording: message.recording,
      recordingTime: message.recording_time.sec + message.recording_time.nsec / 1e9,
      filename: message.filename,
      filesize: message.filesize,
      spaceLeft: message.space_left,
    });
  }, []);

  // Subscribe to recordings list
  const { loading, error, connected } = useRosTopic<RecordsMonitorMessage>({
    topic: settings.recorder.topic,
    messageType: MessageType.RECORDS_MONITOR,
    onMessage: handleRecordingsMessage,
  });

  // Subscribe to recording status
  useRosTopic<RecordingStatusMessage>({
    topic: settings.recorder.statusTopic,
    messageType: MessageType.RECORDING_STATUS,
    onMessage: handleStatusMessage,
  });

  const deleteRecording = async (filename: string): Promise<boolean> => {
    try {
      const request: DeleteRecordingRequest = {
        filename: filename,
      };

      await unifiedWebSocket.callService<DeleteRecordingRequest, any>(
        settings.recorder.deleteService,
        request
      );

      return true;
    } catch (err) {
      console.error("Failed to delete recording:", err);
      throw err;
    }
  };

  const startRecording = async (): Promise<boolean> => {
    try {
      const request: StartRecordingRequest = {
        topics: settings.recorder.topics,
      };

      await unifiedWebSocket.callService<StartRecordingRequest, any>(
        settings.recorder.startService,
        request
      );

      return true;
    } catch (err) {
      console.error("Failed to start recording:", err);
      throw err;
    }
  };

  const stopRecording = async (): Promise<boolean> => {
    try {
      const request: StopRecordingRequest = {};

      await unifiedWebSocket.callService<StopRecordingRequest, any>(
        settings.recorder.stopService,
        request
      );

      return true;
    } catch (err) {
      console.error("Failed to stop recording:", err);
      throw err;
    }
  };

  return {
    recordings,
    loading,
    error,
    connected,
    recordingStatus,
    deleteRecording,
    startRecording,
    stopRecording,
  };
}
