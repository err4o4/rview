"use client"

import { useState, useCallback } from "react"
import { MessageType, SystemStatusMessage } from "@/lib/services/unifiedWebSocket"
import { useRosTopic } from "@/lib/hooks/useRosTopic"

interface StatsViewerProps {
  topic: string
}

export function StatsViewer({ topic }: StatsViewerProps) {
  const [cpuHistory, setCpuHistory] = useState<number[][]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const historyLength = 20

  const handleMessage = useCallback((message: SystemStatusMessage) => {
    // Update CPU history for sparklines
    setCpuHistory((prev) => {
      const newHistory = message.cpu_percent.map((cpuPercent, index) => {
        const coreHistory = prev[index] || []
        return [...coreHistory.slice(-historyLength + 1), cpuPercent]
      })
      return newHistory
    })
  }, [])

  const { message: stats } = useRosTopic<SystemStatusMessage>({
    topic,
    messageType: MessageType.SYSTEM_STATUS,
    enabled: !!topic,
    onMessage: handleMessage,
  })

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)}GB`
  }

  const MiniChart = ({ data, color }: { data: number[]; color: string }) => {
    const width = 50
    const height = 12
    const max = 100

    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * width
        const y = height - (value / max) * height
        return `${x},${y}`
      })
      .join(' ')

    return (
      <svg width={width} height={height} className="inline-block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    )
  }

  if (!topic || !stats) return null

  return (
    <div
      className="absolute right-4 bottom-4 z-10 bg-background/70 backdrop-blur-sm border rounded-md shadow-lg overflow-hidden text-xs cursor-pointer hover:bg-background/80 transition-colors"
      style={{
        //bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        width: isCollapsed ? '140px' : '140px'
      }}
      onClick={() => setIsCollapsed(prev => !prev)}
    >
      <div className="p-2 space-y-1">
        {isCollapsed ? (
          // Collapsed view - only two lines
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPU</span>
              <span>{stats.cpu_percent_avg.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RAM</span>
              <span>{formatBytes(stats.ram_used)}/{formatBytes(stats.ram_total)}</span>
            </div>
          </>
        ) : (
          // Expanded view - full details
          <>
            {/* CPU Section */}
            <div className="pb-1 border-b border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPU</span>
                <span>{stats.cpu_percent_avg.toFixed(1)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {stats.cpu_percent.map((percent, index) => (
                  <div key={index} className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-muted-foreground">{index}</span>
                    <div className="flex items-center gap-1">
                      {cpuHistory[index] && cpuHistory[index].length > 1 && (
                        <MiniChart data={cpuHistory[index]} color="rgb(59, 130, 246)" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RAM Section */}
            <div className="pt-1">
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RAM</span>
                  <span>{formatBytes(stats.ram_used)} / {formatBytes(stats.ram_total)}</span>
                </div>
                <div className="h-1.5 mt-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${stats.ram_percent}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
