"use client";

import { useState, useEffect } from "react";
import { type RecordingFile } from "../services/unifiedWebSocket";
import { useSupervisorStatus } from "./useSupervisorStatus";
import { useRosCommand } from "./useRosCommand";
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

function recordFileToRecording(file: RecordingFile): Recording {
  return {
    id: file.name,
    name: file.name,
    size: file.size_bytes,
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
  const { status, loading, error, connected } = useSupervisorStatus();
  const { execute } = useRosCommand();

  // Update recordings and status when supervisor status changes
  useEffect(() => {
    if (status?.recordings?.list) {
      const convertedRecordings = status.recordings.list
        .filter((file) => file.name.endsWith(".bag") || file.name.endsWith(".bag.active"))
        .map(recordFileToRecording)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setRecordings(convertedRecordings);
    } else {
      setRecordings([]);
    }

    if (status?.recording) {
      setRecordingStatus({
        recording: status.recording.is_recording,
        recordingTime: status.recording.recording_time.sec + status.recording.recording_time.nsec / 1e9,
        filename: status.recording.filename,
        filesize: status.recording.size_bytes,
        spaceLeft: status.system?.storage?.available_bytes || 0,
      });
    } else {
      setRecordingStatus({
        recording: false,
        recordingTime: 0,
        filename: "",
        filesize: 0,
        spaceLeft: status?.system?.storage?.available_bytes || 0,
      });
    }
  }, [status]);

  const deleteRecording = async (filename: string): Promise<boolean> => {
    try {
      await execute("delete_recording", {
        filename: filename,
      });

      return true;
    } catch (err) {
      console.error("Failed to delete recording:", err);
      throw err;
    }
  };

  const startRecording = async (): Promise<boolean> => {
    try {
      await execute("start_recording", {
        topics: settings.recorder.topics,
      });

      return true;
    } catch (err) {
      console.error("Failed to start recording:", err);
      throw err;
    }
  };

  const stopRecording = async (): Promise<boolean> => {
    try {
      await execute("stop_recording", {});

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
