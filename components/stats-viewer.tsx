"use client"

import { useState, useEffect } from "react"
import { useSupervisorStatus } from "@/lib/hooks/useSupervisorStatus"
import { useViewerState } from "@/lib/hooks/useViewerState"

export function StatsViewer() {
  const [cpuHistory, setCpuHistory] = useState<number[][]>([])
  const historyLength = 20

  const { status } = useSupervisorStatus()
  const { state: viewerState, loaded: viewerStateLoaded, setStatsCollapsed } = useViewerState()
  const isCollapsed = viewerStateLoaded ? viewerState.statsCollapsed : false

  // Update CPU history when status changes
  useEffect(() => {
    if (status?.system?.cpu) {
      setCpuHistory((prev) => {
        const newHistory = status.system.cpu.percent_per_core.map((cpuPercent, index) => {
          const coreHistory = prev[index] || []
          return [...coreHistory.slice(-historyLength + 1), cpuPercent]
        })
        return newHistory
      })
    }
  }, [status])

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

  if (!status?.system) return null

  const { cpu, ram } = status.system

  return (
    <div
      className="absolute right-4 bottom-4 z-10 bg-background/70 backdrop-blur-sm border rounded-md shadow-lg overflow-hidden text-xs cursor-pointer hover:bg-background/80 transition-colors"
      style={{
        //bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        width: isCollapsed ? '140px' : '140px'
      }}
      onClick={() => setStatsCollapsed(!isCollapsed)}
    >
      <div className="p-2 space-y-1">
        {isCollapsed ? (
          // Collapsed view - only two lines
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPU</span>
              <span>{cpu.percent_avg.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RAM</span>
              <span>{formatBytes(ram.used_bytes)}/{formatBytes(ram.total_bytes)}</span>
            </div>
          </>
        ) : (
          // Expanded view - full details
          <>
            {/* CPU Section */}
            <div className="pb-1 border-b border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPU</span>
                <span>{cpu.percent_avg.toFixed(1)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {cpu.percent_per_core.map((percent, index) => (
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
                  <span>{formatBytes(ram.used_bytes)} / {formatBytes(ram.total_bytes)}</span>
                </div>
                <div className="h-1.5 mt-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${ram.percent}%` }}
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
