import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import type { AppConfig } from "@/lib/config/appConfig"

interface RosRecorderTabProps {
  config: AppConfig
  addRecordingTopic: () => void
  removeRecordingTopic: (index: number) => void
  updateRecordingTopic: (index: number, value: string) => void
}

export function RosRecorderTab({
  config,
  addRecordingTopic,
  removeRecordingTopic,
  updateRecordingTopic,
}: RosRecorderTabProps) {
  return (
    <TabsContent value="ros-recorder" className="space-y-6 mt-4">
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
    </TabsContent>
  )
}
