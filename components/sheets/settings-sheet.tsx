"use client"

import { useState, useEffect } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useSettings } from "@/lib/hooks/useSettings"
import type { AppConfig, StartableNode, NodeArg } from "@/lib/config/appConfig"
import { toast } from "sonner"
import {
  GeneralTab,
  ViewerTab,
  CameraTab,
  NodesTab,
  RosRecorderTab,
  RecorderTab,
  OtherTab,
} from "./settings-tabs"

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { settings, saveSettings, resetSettings, loaded } = useSettings()
  const [config, setConfig] = useState<AppConfig>(settings)
  const [activeTab, setActiveTab] = useState("general")
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

  const updatePointcloud = (field: keyof AppConfig["pointcloud"], value: string | number | boolean) => {
    setConfig({ ...config, pointcloud: { ...config.pointcloud, [field]: value } })
  }

  const updateCamera = (field: keyof AppConfig["camera"], value: string) => {
    setConfig({ ...config, camera: { ...config.camera, [field]: value } })
  }

  const updateStats = (field: keyof AppConfig["stats"], value: string) => {
    setConfig({ ...config, stats: { ...config.stats, [field]: value } })
  }

  const updateTF = (field: keyof AppConfig["tf"], value: any) => {
    setConfig({ ...config, tf: { ...config.tf, [field]: value } })
  }

  const updateTFFollow = (field: keyof AppConfig["tf"]["follow"], value: any) => {
    setConfig({ ...config, tf: { ...config.tf, follow: { ...config.tf.follow, [field]: value } } })
  }

  const updateNodes = (field: keyof AppConfig["nodes"], value: any) => {
    setConfig({ ...config, nodes: { ...config.nodes, [field]: value } })
  }

  const updateRecorder = (field: keyof AppConfig["recorder"], value: any) => {
    setConfig({ ...config, recorder: { ...config.recorder, [field]: value } })
  }

  const updateRecording = (field: keyof AppConfig["recording"], value: any) => {
    setConfig({ ...config, recording: { ...config.recording, [field]: value } })
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
        <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="h-4 w-4" /></Button>
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="mx-4 space-y-2">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="viewer">Viewer</TabsTrigger>
              <TabsTrigger value="camera">Camera</TabsTrigger>
              <TabsTrigger value="recorder">Recorder</TabsTrigger>
            </TabsList>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="nodes">Nodes</TabsTrigger>
              <TabsTrigger value="ros-recorder">ROS Recorder</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-4 min-h-0 pb-4">
            <GeneralTab
              config={config}
              updateConnection={updateConnection}
            />
            <ViewerTab
              config={config}
              updatePointcloud={updatePointcloud}
              updateTF={updateTF}
              updateTFFollow={updateTFFollow}
            />
            <CameraTab
              config={config}
              updateCamera={updateCamera}
            />
            <NodesTab
              config={config}
              launchOpenStates={launchOpenStates}
              toggleLaunch={toggleLaunch}
              addLaunch={addLaunch}
              removeLaunch={removeLaunch}
              updateLaunch={updateLaunch}
              addLaunchArg={addLaunchArg}
              removeLaunchArg={removeLaunchArg}
              updateLaunchArg={updateLaunchArg}
              addExclude={addExclude}
              removeExclude={removeExclude}
              updateExclude={updateExclude}
            />
            <RosRecorderTab
              config={config}
              addRecordingTopic={addRecordingTopic}
              removeRecordingTopic={removeRecordingTopic}
              updateRecordingTopic={updateRecordingTopic}
            />
            <RecorderTab
              config={config}
              updateRecording={updateRecording}
            />
            <OtherTab
              config={config}
              updateNodes={updateNodes}
              updateRecorder={updateRecorder}
              updateStats={updateStats}
              updateTF={updateTF}
            />
          </div>
        </Tabs>
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
