"use client";

import { useEffect, useState, useCallback } from "react";
import { unifiedWebSocket, MessageType, SupervisorStatusMessage } from "../services/unifiedWebSocket";

interface UseSupervisorStatusOptions {
  enabled?: boolean;
  onMessage?: (message: SupervisorStatusMessage) => void;
}

interface UseSupervisorStatusResult {
  status: SupervisorStatusMessage | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Hook for subscribing to the unified supervisor status topic
 * Receives all system status, recording status, nodes, recordings, and supervisor health
 * Published at 1Hz by the supervisor
 */
export function useSupervisorStatus({
  enabled = true,
  onMessage,
}: UseSupervisorStatusOptions = {}): UseSupervisorStatusResult {
  const [status, setStatus] = useState<SupervisorStatusMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Memoize the callback to prevent re-subscriptions
  const onMessageCallback = useCallback((msg: SupervisorStatusMessage) => {
    setStatus(msg);
    onMessage?.(msg);
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const connectAndSubscribe = async () => {
      try {
        await unifiedWebSocket.connect();

        if (!mounted) return;

        setConnected(true);
        setLoading(false);
        setError(null);

        unsubscribe = unifiedWebSocket.subscribeTopic<SupervisorStatusMessage>(
          "/supervisor/status",
          MessageType.SUPERVISOR_STATUS,
          (msg) => {
            if (!mounted) return;
            onMessageCallback(msg);
          }
        );
      } catch (err) {
        if (!mounted) return;

        console.error("Failed to connect to supervisor status topic:", err);
        setError("Failed to connect");
        setLoading(false);
        setConnected(false);
      }
    };

    connectAndSubscribe();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [enabled, onMessageCallback]);

  return {
    status,
    connected,
    error,
    loading,
  };
}
