"use client";

import { useState, useCallback } from "react";
import { unifiedWebSocket, CommandParams, CommandResponse } from "../services/unifiedWebSocket";

interface UseRosCommandResult {
  execute: (action: string, params?: CommandParams) => Promise<CommandResponse>;
  loading: boolean;
  error: string | null;
  lastResponse: CommandResponse | null;
}

/**
 * Hook for calling the unified ROS command service
 * Supports actions: start_node, stop_node, start_recording, stop_recording, delete_recording
 */
export function useRosCommand(): UseRosCommandResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(null);

  const execute = useCallback(async (action: string, params: CommandParams = {}): Promise<CommandResponse> => {
    setLoading(true);
    setError(null);

    try {
      await unifiedWebSocket.connect();

      const response = await unifiedWebSocket.callCommand(action, params);

      setLastResponse(response);
      setLoading(false);

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to execute command ${action}:`, err);
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  }, []);

  return {
    execute,
    loading,
    error,
    lastResponse,
  };
}
