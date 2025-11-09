import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import type { AppConfig } from "@/lib/config/appConfig"

interface CameraTabProps {
  config: AppConfig
  updateCamera: (field: keyof AppConfig["camera"], value: string) => void
}

export function CameraTab({ config, updateCamera }: CameraTabProps) {
  return (
    <TabsContent value="camera" className="space-y-6 mt-4">
      <div className="space-y-2">
        <Label htmlFor="camera-topic">Camera Topic</Label>
        <Input
          id="camera-topic"
          value={config.camera.topic}
          onChange={(e) => updateCamera("topic", e.target.value)}
          placeholder="/camera/image_raw"
        />
      </div>
    </TabsContent>
  )
}
