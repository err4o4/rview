"use client"

import { useState } from "react"
import { NodesSheet } from "@/components/sheets/nodes-sheet"
import { RecordSheet } from "@/components/sheets/record-sheet"
import { SettingsSheet } from "@/components/sheets/settings-sheet"
import { PointCloudViewer } from "@/components/pointcloud-viewer"
import { CameraViewer } from "@/components/camera-viewer"
import { StatsViewer } from "@/components/stats-viewer"
import { useWebSocketStatus } from "@/lib/hooks/useWebSocketStatus"
import { useSettings } from "@/lib/hooks/useSettings"

export default function Home() {
  const [nodesOpen, setNodesOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { connected } = useWebSocketStatus()
  const { settings, loaded } = useSettings()

  return (
    <div className="min-h-screen">
      {/* Split Header - Two Separate Blocks */}
      <header className="fixed top-0 left-0 right-0 z-20 pointer-events-none" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}>
        <div className="w-full px-4 flex items-start justify-between">
          {/* Left Block - Title and Connection Status */}
          <div className="h-10 flex items-center gap-3 px-3 py-1 bg-background/90 backdrop-blur-sm rounded-md border pointer-events-auto">
            <h1 className="text-base font-semibold">RView</h1>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-xs font-medium">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          {/* Right Block - Sheet Buttons */}
          <div className="h-10 flex items-center gap-3 px-3 py-1 bg-background/90 backdrop-blur-sm rounded-md border pointer-events-auto">
            <NodesSheet open={nodesOpen} onOpenChange={setNodesOpen} />
            <RecordSheet open={recordOpen} onOpenChange={setRecordOpen} />
            <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
          </div>
        </div>
      </header>

      {/* Main Content - extends behind header */}
      <main className="fixed inset-0 overflow-hidden">
        {loaded && (
          <div className="w-full h-full relative">
            <PointCloudViewer
              topic={settings.pointcloud.topic}
            />
            <CameraViewer
              topic={settings.camera.topic}
            />
            <StatsViewer
              topic={settings.stats.topic}
            />
          </div>
        )}
      </main>
    </div>
  )
}
