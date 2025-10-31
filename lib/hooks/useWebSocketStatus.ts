"use client";

import { useEffect, useState } from "react";
import { unifiedWebSocket } from "../services/unifiedWebSocket";

export function useWebSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkConnection = async () => {
      try {
        await unifiedWebSocket.connect();
        if (mounted) {
          setConnected(unifiedWebSocket.isConnected());
        }
      } catch (err) {
        if (mounted) {
          setConnected(false);
        }
      }
    };

    checkConnection();

    // Poll connection status every second
    const interval = setInterval(() => {
      if (mounted) {
        setConnected(unifiedWebSocket.isConnected());
      }
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { connected };
}
