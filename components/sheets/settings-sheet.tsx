"use client"

import { useState, useEffect } from "react"
import { Settings, Plus, Trash2, ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useSettings } from "@/lib/hooks/useSettings"
import type { AppConfig, StartableNode, NodeArg } from "@/lib/config/appConfig"
import { toast } from "sonner"

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { settings, saveSettings, resetSettings, loaded } = useSettings()
  const { theme, setTheme } = useTheme()
  const [config, setConfig] = useState<AppConfig>(settings)
  const [nodesOpen, setNodesOpen] = useState(false)
  const [recorderOpen, setRecorderOpen] = useState(false)
  const [launchOpenStates, setLaunchOpenStates] = useState<boolean[]>([])

  useEffect(() => {
    if (loaded) {
      setConfig(settings)
      setLaunchOpenStates(new Array(settings.nodes.launch.length).fill(false))
    }
  }, [settings, loaded])

  const handleSave = () => {
    saveSettings(config)
    toast.success("Settings saved successfully")
    onOpenChange(false)
  }

  const handleReset = () => {
    resetSettings()
    toast.success("Settings reset to defaults")
  }

  // Helper functions for updating nested config
  const updateConnection = (field: keyof AppConfig["connection"], value: string) => {
    setConfig({ ...config, connection: { ...config.connection, [field]: value } })
  }

  const updatePointcloud = (field: keyof AppConfig["pointcloud"], value: string | number) => {
    setConfig({ ...config, pointcloud: { ...config.pointcloud, [field]: value } })
  }

  const updateCamera = (field: keyof AppConfig["camera"], value: string) => {
    setConfig({ ...config, camera: { ...config.camera, [field]: value } })
  }

  const updateStats = (field: keyof AppConfig["stats"], value: string) => {
    setConfig({ ...config, stats: { ...config.stats, [field]: value } })
  }

  const updateNodes = (field: keyof AppConfig["nodes"], value: any) => {
    setConfig({ ...config, nodes: { ...config.nodes, [field]: value } })
  }

  const updateRecorder = (field: keyof AppConfig["recorder"], value: any) => {
    setConfig({ ...config, recorder: { ...config.recorder, [field]: value } })
  }

  // Exclude management
  const addExclude = () => {
    updateNodes("exclude", [...config.nodes.exclude, ""])
  }

  const removeExclude = (index: number) => {
    const newExclude = config.nodes.exclude.filter((_, i) => i !== index)
    updateNodes("exclude", newExclude)
  }

  const updateExclude = (index: number, value: string) => {
    const newExclude = [...config.nodes.exclude]
    newExclude[index] = value
    updateNodes("exclude", newExclude)
  }

  // Launch management
  const addLaunch = () => {
    const newLaunch: StartableNode = {
      package: "",
      launchFile: "",
      args: []
    }
    updateNodes("launch", [...config.nodes.launch, newLaunch])
    setLaunchOpenStates([...launchOpenStates, false])
  }

  const removeLaunch = (index: number) => {
    const newLaunch = config.nodes.launch.filter((_, i) => i !== index)
    updateNodes("launch", newLaunch)
    const newOpenStates = launchOpenStates.filter((_, i) => i !== index)
    setLaunchOpenStates(newOpenStates)
  }

  const toggleLaunch = (index: number) => {
    const newOpenStates = [...launchOpenStates]
    newOpenStates[index] = !newOpenStates[index]
    setLaunchOpenStates(newOpenStates)
  }

  const updateLaunch = (index: number, field: keyof StartableNode, value: any) => {
    const newLaunch = [...config.nodes.launch]
    newLaunch[index] = { ...newLaunch[index], [field]: value }
    updateNodes("launch", newLaunch)
  }

  const addLaunchArg = (launchIndex: number) => {
    const newLaunch = [...config.nodes.launch]
    const newArg: NodeArg = { key: "", value: "" }
    newLaunch[launchIndex] = {
      ...newLaunch[launchIndex],
      args: [...newLaunch[launchIndex].args, newArg]
    }
    updateNodes("launch", newLaunch)
  }

  const removeLaunchArg = (launchIndex: number, argIndex: number) => {
    const newLaunch = [...config.nodes.launch]
    newLaunch[launchIndex] = {
      ...newLaunch[launchIndex],
      args: newLaunch[launchIndex].args.filter((_, i) => i !== argIndex)
    }
    updateNodes("launch", newLaunch)
  }

  const updateLaunchArg = (launchIndex: number, argIndex: number, field: keyof NodeArg, value: string) => {
    const newLaunch = [...config.nodes.launch]
    const newArgs = [...newLaunch[launchIndex].args]
    newArgs[argIndex] = { ...newArgs[argIndex], [field]: value }
    newLaunch[launchIndex] = { ...newLaunch[launchIndex], args: newArgs }
    updateNodes("launch", newLaunch)
  }

  // Recording topics management
  const addRecordingTopic = () => {
    updateRecorder("topics", [...config.recorder.topics, ""])
  }

  const removeRecordingTopic = (index: number) => {
    const newTopics = config.recorder.topics.filter((_, i) => i !== index)
    updateRecorder("topics", newTopics)
  }

  const updateRecordingTopic = (index: number, value: string) => {
    const newTopics = [...config.recorder.topics]
    newTopics[index] = value
    updateRecorder("topics", newTopics)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost"><Settings /></Button>
      </SheetTrigger>
      <SheetContent
        className="flex flex-col w-full sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        {!loaded && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading settings...</div>
          </div>
        )}

        {loaded && (
        <div className="flex-1 overflow-y-auto space-y-6 px-4">
          {/* Connection Block */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="connection-url">Connection URL</Label>
              <Input
                id="connection-url"
                value={config.connection.url}
                onChange={(e) => updateConnection("url", e.target.value)}
                placeholder="ws://192.168.1.220:8765"
                autoFocus={false}
              />
            </div>
          </div>

          {/* Pointcloud Block */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="pointcloud-topic">Pointcloud Topic</Label>
              <Input
                id="pointcloud-topic"
                value={config.pointcloud.topic}
                onChange={(e) => updatePointcloud("topic", e.target.value)}
                placeholder="/ouster/points"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pointcloud-decay">Decay Time (ms)</Label>
              <Input
                id="pointcloud-decay"
                type="number"
                value={config.pointcloud.decayTimeMs}
                onChange={(e) => updatePointcloud("decayTimeMs", parseInt(e.target.value) || 1000)}
                placeholder="1000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pointcloud-maxpoints">Max Points (0 = unlimited)</Label>
              <Input
                id="pointcloud-maxpoints"
                type="number"
                value={config.pointcloud.maxPoints}
                onChange={(e) => updatePointcloud("maxPoints", parseInt(e.target.value) || 0)}
                placeholder="100000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pointcloud-size">Point Size</Label>
              <Input
                id="pointcloud-size"
                type="number"
                step="0.1"
                value={config.pointcloud.pointSize}
                onChange={(e) => updatePointcloud("pointSize", parseFloat(e.target.value) || 2)}
                placeholder="2"
              />
            </div>
          </div>

          {/* Camera Block */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="camera-topic">Camera Topic</Label>
              <Input
                id="camera-topic"
                value={config.camera.topic}
                onChange={(e) => updateCamera("topic", e.target.value)}
                placeholder="/camera/image_raw"
              />
            </div>
          </div>

          {/* Recorder Block */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Topics to Record</Label>
                <Button size="sm" variant="ghost" onClick={addRecordingTopic}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {config.recorder.topics.map((topic, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={topic}
                    onChange={(e) => updateRecordingTopic(index, e.target.value)}
                    placeholder="/ouster/points"
                  />
                  <Button size="icon" variant="ghost" onClick={() => removeRecordingTopic(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Nodes Block */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Nodes</Label>
                <Button size="sm" variant="ghost" onClick={addLaunch}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {config.nodes.launch.map((launch, launchIndex) => (
                <Collapsible
                  key={launchIndex}
                  open={launchOpenStates[launchIndex]}
                  onOpenChange={() => toggleLaunch(launchIndex)}
                >
                  <div className="border rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground flex-1 text-left">
                        <ChevronDown className={`h-4 w-4 transition-transform ${launchOpenStates[launchIndex] ? "" : "-rotate-90"}`} />
                        {launch.package || "New Launch"} / {launch.launchFile || "..."}
                      </CollapsibleTrigger>
                      <Button size="icon" variant="ghost" onClick={() => removeLaunch(launchIndex)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CollapsibleContent className="space-y-2">
                      <Input
                        value={launch.package}
                        onChange={(e) => updateLaunch(launchIndex, "package", e.target.value)}
                        placeholder="Package name"
                      />
                      <Input
                        value={launch.launchFile}
                        onChange={(e) => updateLaunch(launchIndex, "launchFile", e.target.value)}
                        placeholder="Launch file"
                      />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Arguments</Label>
                          <Button size="sm" variant="ghost" onClick={() => addLaunchArg(launchIndex)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {launch.args.map((arg, argIndex) => (
                          <div key={argIndex} className="flex gap-2">
                            <Input
                              value={arg.key}
                              onChange={(e) => updateLaunchArg(launchIndex, argIndex, "key", e.target.value)}
                              placeholder="Key"
                              className="flex-1"
                            />
                            <Input
                              value={arg.value}
                              onChange={(e) => updateLaunchArg(launchIndex, argIndex, "value", e.target.value)}
                              placeholder="Value"
                              className="flex-1"
                            />
                            <Button size="icon" variant="ghost" onClick={() => removeLaunchArg(launchIndex, argIndex)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>

            
          </div>

          <Collapsible open={nodesOpen} onOpenChange={setNodesOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-4 w-4 transition-transform ${nodesOpen ? "" : "-rotate-90"}`} />
                Topics Settings
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="nodes-topic">Nodes List</Label>
                  <Input
                    id="nodes-topic"
                    value={config.nodes.topic}
                    onChange={(e) => updateNodes("topic", e.target.value)}
                    placeholder="/supervisor/monitor/nodes"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recorder-topic">Records List</Label>
                  <Input
                    id="recorder-topic"
                    value={config.recorder.topic}
                    onChange={(e) => updateRecorder("topic", e.target.value)}
                    placeholder="/supervisor/monitor/records"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recorder-status-topic">Recording status topic</Label>
                  <Input
                    id="recorder-status-topic"
                    value={config.recorder.statusTopic}
                    onChange={(e) => updateRecorder("statusTopic", e.target.value)}
                    placeholder="/supervisor/monitor/recording"
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="stats-topic">System Stats</Label>
                    <Input
                      id="stats-topic"
                      value={config.stats.topic}
                      onChange={(e) => updateStats("topic", e.target.value)}
                      placeholder="/supervisor/monitor/system"
                    />
                  </div>
                </div>
                

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Hide Nodes</Label>
                    <Button size="sm" variant="ghost" onClick={addExclude}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {config.nodes.exclude.map((exclude, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={exclude}
                        onChange={(e) => updateExclude(index, e.target.value)}
                        placeholder="/rosout"
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeExclude(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <Collapsible open={recorderOpen} onOpenChange={setRecorderOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-4 w-4 transition-transform ${recorderOpen ? "" : "-rotate-90"}`} />
                Services Settings
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                  <div className="space-y-2">
                    <Label htmlFor="nodes-start-service">Node Start</Label>
                    <Input
                      id="nodes-start-service"
                      value={config.nodes.startService}
                      onChange={(e) => updateNodes("startService", e.target.value)}
                      placeholder="/supervisor/actions/start_node"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nodes-stop-service">Node Stop</Label>
                    <Input
                      id="nodes-stop-service"
                      value={config.nodes.stopService}
                      onChange={(e) => updateNodes("stopService", e.target.value)}
                      placeholder="/supervisor/actions/stop_node"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recorder-start-service">Start Recording</Label>
                    <Input
                      id="recorder-start-service"
                      value={config.recorder.startService}
                      onChange={(e) => updateRecorder("startService", e.target.value)}
                      placeholder="/supervisor/actions/start_recording"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recorder-stop-service">Stop Recording</Label>
                    <Input
                      id="recorder-stop-service"
                      value={config.recorder.stopService}
                      onChange={(e) => updateRecorder("stopService", e.target.value)}
                      placeholder="/supervisor/actions/stop_recording"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recorder-delete-service">Delete Recording</Label>
                    <Input
                      id="recorder-delete-service"
                      value={config.recorder.deleteService}
                      onChange={(e) => updateRecorder("deleteService", e.target.value)}
                      placeholder="/supervisor/actions/delete_recording"
                    />
                  </div>
                  
              </CollapsibleContent>
            </Collapsible>
            {/* Theme Toggle */}
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="theme-toggle">Dark Mode</Label>
            <Switch
              id="theme-toggle"
              checked={theme === "dark"}
              onCheckedChange={(checked: boolean) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </div>
        )}

        {/* Footer Actions */}
        {loaded && (
        <div className="flex gap-2 pt-2 mb-2 px-4 border-t">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            Reset
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Save
          </Button>
        </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
