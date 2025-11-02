"use client"

import { useState } from "react"
import { Square, Loader2, Workflow, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"

import { useRosNodes } from "@/lib/hooks/useRosNodes"
import { useSettings } from "@/lib/hooks/useSettings"

interface NodesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodesSheet({ open, onOpenChange }: NodesSheetProps) {
  const { nodes, loading, error, connected, stopNode, startNode } = useRosNodes()
  const { settings } = useSettings()
  const [stoppingNodes, setStoppingNodes] = useState<Set<string>>(new Set())
  const [startingNodes, setStartingNodes] = useState<Set<string>>(new Set())
  const startableNodes = settings.nodes.launch

  const handleStopNode = async (nodeName: string, pid: number) => {
    setStoppingNodes(prev => new Set(prev).add(nodeName))
    try {
      await stopNode(nodeName, pid)
    } catch (err) {
      console.error("Failed to stop node:", err)
    } finally {
      setStoppingNodes(prev => {
        const next = new Set(prev)
        next.delete(nodeName)
        return next
      })
    }
  }

  const handleStartNode = async (packageName: string, launchFile: string, args: Array<{ key: string; value: string }>) => {
    const nodeKey = `${packageName}/${launchFile}`
    setStartingNodes(prev => new Set(prev).add(nodeKey))
    try {
      await startNode(packageName, launchFile, args)
    } catch (err) {
      console.error("Failed to start node:", err)
    } finally {
      setStartingNodes(prev => {
        const next = new Set(prev)
        next.delete(nodeKey)
        return next
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Workflow className="h-4 w-4"/></Button>
      </SheetTrigger>
      <SheetContent
        className="flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Nodes</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-6 -mx-4 px-4">
          {/* Startable Nodes Section */}
          <div>
            <h3 className="text-sm font-medium mb-2 px-4">Available Nodes</h3>
            <div className="space-y-0">
              {startableNodes.map((node) => {
                const nodeKey = `${node.package}/${node.launchFile}`
                const isStarting = startingNodes.has(nodeKey)
                return (
                  <Item key={nodeKey} className="py-2">
                    <ItemContent>
                      <ItemTitle>{node.package}</ItemTitle>
                      <ItemDescription className="text-muted-foreground">
                        {node.launchFile}
                        {node.args.length > 0 && (
                          <span className="text-xs block">
                            ({node.args.map(arg => `${arg.key}=${arg.value}`).join(", ")})
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isStarting}
                        onClick={() => handleStartNode(node.package, node.launchFile, node.args)}
                        aria-label="Start node"
                      >
                        {isStarting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                      </Button>
                    </ItemActions>
                  </Item>
                )
              })}
            </div>
          </div>

          {/* Running Nodes Section */}
          <div>
            <h3 className="text-sm font-medium mb-2 px-4">Running Nodes</h3>
            <div className="space-y-0">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive py-4 text-center">
                  {error}
                </div>
              )}

              {!loading && !error && nodes.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No nodes running
                </div>
              )}

              {!loading && !error && nodes.map((node) => {
                const isStopping = stoppingNodes.has(node.name)
                return (
                  <Item key={node.name} className="py-2">
                    <ItemContent>
                      <ItemTitle>{node.name}</ItemTitle>
                      <ItemDescription className="text-muted-foreground">
                        PID: {node.pid}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isStopping}
                        onClick={() => handleStopNode(node.name, node.pid)}
                        aria-label="Stop node"
                      >
                        {isStopping ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>
                    </ItemActions>
                  </Item>
                )
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
