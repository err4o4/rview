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
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-background border-b" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="w-full px-4 h-13 flex items-center justify-between max-w-screen-2xl mx-auto">
          {/* Left Side - Title and Connection Status */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">RView</h1>

            {/* Connection Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/90 backdrop-blur-sm">
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

          {/* Right Side - Sheet Buttons */}
          <div className="flex items-center gap-2">
            <NodesSheet open={nodesOpen} onOpenChange={setNodesOpen} />
            <RecordSheet open={recordOpen} onOpenChange={setRecordOpen} />
            <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
          </div>
        </div>
      </header>

      {/* Main Content - with padding to account for fixed header */}
      <main
        className="fixed inset-0 overflow-hidden"
        style={{
          top: 'calc(3.25rem + env(safe-area-inset-top))',
          bottom: 0
        }}
      >
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
