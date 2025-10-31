"use client";

import { useState, useCallback } from "react";
import { unifiedWebSocket, MessageType, type NodesMonitorMessage, type RosNode, type StopNodeRequest, type StartNodeRequest } from "../services/unifiedWebSocket";
import { useRosTopic } from "./useRosTopic";
import { useSettings } from "./useSettings";

export function useRosNodes() {
  const [nodes, setNodes] = useState<RosNode[]>([]);
  const { settings } = useSettings();

  const handleMessage = useCallback((message: NodesMonitorMessage) => {
    if (!message.nodes || !Array.isArray(message.nodes)) {
      console.warn("Invalid nodes message format");
      return;
    }

    // Filter out excluded nodes
    const filteredNodes = message.nodes.filter(
      (node) => !settings.nodes.exclude.includes(node.name)
    );

    setNodes(filteredNodes);
  }, [settings.nodes.exclude]);

  const { loading, error, connected } = useRosTopic<NodesMonitorMessage>({
    topic: settings.nodes.topic,
    messageType: MessageType.NODES_MONITOR,
    onMessage: handleMessage,
  });

  const stopNode = async (nodeName: string, pid: number): Promise<boolean> => {
    try {
      const request: StopNodeRequest = {
        node: nodeName,
        pid: pid,
      };

      await unifiedWebSocket.callService<StopNodeRequest, any>(
        settings.nodes.stopService,
        request
      );

      return true;
    } catch (err) {
      console.error("Failed to stop node:", err);
      throw err;
    }
  };

  const startNode = async (
    packageName: string,
    launchFile: string,
    args: Array<{ key: string; value: string }>
  ): Promise<boolean> => {
    try {
      const request: StartNodeRequest = {
        package: packageName,
        launch_file: launchFile,
        args: args,
      };

      await unifiedWebSocket.callService<StartNodeRequest, any>(
        settings.nodes.startService,
        request
      );

      return true;
    } catch (err) {
      console.error("Failed to start node:", err);
      throw err;
    }
  };

  return {
    nodes,
    loading,
    error,
    connected,
    stopNode,
    startNode,
  };
}
