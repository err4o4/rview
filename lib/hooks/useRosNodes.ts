"use client";

import { useState, useEffect } from "react";
import { type RosNode } from "../services/unifiedWebSocket";
import { useSupervisorStatus } from "./useSupervisorStatus";
import { useRosCommand } from "./useRosCommand";
import { useSettings } from "./useSettings";

export function useRosNodes() {
  const [nodes, setNodes] = useState<RosNode[]>([]);
  const { settings } = useSettings();
  const { status, loading, error, connected } = useSupervisorStatus();
  const { execute } = useRosCommand();

  // Update nodes when status changes
  useEffect(() => {
    if (status?.nodes?.list) {
      // Filter out excluded nodes
      const filteredNodes = status.nodes.list.filter(
        (node) => !settings.nodes.exclude.includes(node.name)
      );
      setNodes(filteredNodes);
    } else {
      setNodes([]);
    }
  }, [status, settings.nodes.exclude]);

  const stopNode = async (nodeName: string, pid: number): Promise<boolean> => {
    try {
      await execute("stop_node", {
        node: nodeName,
        pid: pid,
      });

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
      await execute("start_node", {
        package: packageName,
        launch_file: launchFile,
        args: args,
      });

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
