import { Plus, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AppConfig } from "@/lib/config/appConfig"

interface OtherTabProps {
  config: AppConfig
  updateNodes: (field: keyof AppConfig["nodes"], value: any) => void
  updateRecorder: (field: keyof AppConfig["recorder"], value: any) => void
  updateStats: (field: keyof AppConfig["stats"], value: string) => void
  updateTF: (field: keyof AppConfig["tf"], value: any) => void
}

export function OtherTab({
  config,
  updateNodes,
  updateRecorder,
  updateStats,
  updateTF,
}: OtherTabProps) {
  return (
    <TabsContent value="other" className="space-y-6 mt-4">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4" />
          Topics Settings
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-3">
          <div className="space-y-2">
            <Label htmlFor="nodes-topic">Nodes List Topic</Label>
            <Input
              id="nodes-topic"
              value={config.nodes.topic}
              onChange={(e) => updateNodes("topic", e.target.value)}
              placeholder="/supervisor/monitor/nodes"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recorder-topic">Records List Topic</Label>
            <Input
              id="recorder-topic"
              value={config.recorder.topic}
              onChange={(e) => updateRecorder("topic", e.target.value)}
              placeholder="/supervisor/monitor/records"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recorder-status-topic">Recording Status Topic</Label>
            <Input
              id="recorder-status-topic"
              value={config.recorder.statusTopic}
              onChange={(e) => updateRecorder("statusTopic", e.target.value)}
              placeholder="/supervisor/monitor/recording"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stats-topic">System Stats Topic</Label>
            <Input
              id="stats-topic"
              value={config.stats.topic}
              onChange={(e) => updateStats("topic", e.target.value)}
              placeholder="/supervisor/monitor/system"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4" />
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
    </TabsContent>
  )
}
