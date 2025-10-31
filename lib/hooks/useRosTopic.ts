"use client";

import { useEffect, useState, useCallback } from "react";
import { unifiedWebSocket, MessageType } from "../services/unifiedWebSocket";

interface UseRosTopicOptions<T> {
  topic: string;
  messageType: MessageType;
  enabled?: boolean;
  onMessage?: (message: T) => void;
}

interface UseRosTopicResult<T> {
  message: T | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Reusable hook for subscribing to ROS topics
 * Handles connection, subscription, and cleanup automatically
 */
export function useRosTopic<T>({
  topic,
  messageType,
  enabled = true,
  onMessage,
}: UseRosTopicOptions<T>): UseRosTopicResult<T> {
  const [message, setMessage] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !topic) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const connectAndSubscribe = async () => {
      try {
        await unifiedWebSocket.connect();

        if (!mounted) return;

        setConnected(true);
        setLoading(false);
        setError(null);

        const unsubscribe = unifiedWebSocket.subscribeTopic<T>(
          topic,
          messageType,
          (msg) => {
            if (!mounted) return;

            setMessage(msg);
            onMessage?.(msg);
          }
        );

        return () => {
          unsubscribe();
        };
      } catch (err) {
        if (!mounted) return;

        console.error(`Failed to connect to topic ${topic}:`, err);
        setError("Failed to connect");
        setLoading(false);
        setConnected(false);
      }
    };

    connectAndSubscribe();

    return () => {
      mounted = false;
    };
  }, [enabled, topic, messageType, onMessage]);

  return {
    message,
    connected,
    error,
    loading,
  };
}
