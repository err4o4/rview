import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TabsContent } from "@/components/ui/tabs"
import type { AppConfig } from "@/lib/config/appConfig"

interface ViewerTabProps {
  config: AppConfig
  updatePointcloud: (field: keyof AppConfig["pointcloud"], value: string | number | boolean) => void
  updateTF: (field: keyof AppConfig["tf"], value: any) => void
  updateTFFollow: (field: keyof AppConfig["tf"]["follow"], value: any) => void
}

export function ViewerTab({ config, updatePointcloud, updateTF, updateTFFollow }: ViewerTabProps) {
  return (
    <TabsContent value="viewer" className="space-y-6 mt-4">
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
          <Label htmlFor="pointcloud-decay">Decay Time (s, 0 = never decay)</Label>
          <Input
            id="pointcloud-decay"
            type="number"
            value={config.pointcloud.decayTimeSeconds}
            onChange={(e) => {
              const value = parseInt(e.target.value)
              updatePointcloud("decayTimeSeconds", isNaN(value) ? "" : value)
            }}
            placeholder="10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pointcloud-maxpoints">Max Points (0 = unlimited)</Label>
          <Input
            id="pointcloud-maxpoints"
            type="number"
            value={config.pointcloud.maxPoints}
            onChange={(e) => updatePointcloud("maxPoints", parseInt(e.target.value) || "")}
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
            onChange={(e) => updatePointcloud("pointSize", parseFloat(e.target.value) || "")}
            placeholder="2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pointcloud-latest-size">Latest Scan Point Size</Label>
          <Input
            id="pointcloud-latest-size"
            type="number"
            step="0.1"
            value={config.pointcloud.latestScanPointSize}
            onChange={(e) => updatePointcloud("latestScanPointSize", parseFloat(e.target.value) || "")}
            placeholder="3"
          />
        </div>
        <div className="space-y-2">
          <Label>Color Mode</Label>
          <ButtonGroup className="w-full">
            <Button
              type="button"
              variant={config.pointcloud.colorMode === "intensity" ? "default" : "outline"}
              onClick={() => updatePointcloud("colorMode", "intensity")}
              className="flex-1"
            >
              Intensity
            </Button>
            <Button
              type="button"
              variant={config.pointcloud.colorMode === "rgb" ? "default" : "outline"}
              onClick={() => updatePointcloud("colorMode", "rgb")}
              className="flex-1"
            >
              RGB
            </Button>
          </ButtonGroup>
          <p className="text-xs text-muted-foreground">
            Intensity uses turbo colormap, RGB uses colors from point cloud data
          </p>
        </div>
        <div className="space-y-2">
          <Label>Latest Scan Highlight Mode</Label>
          <ButtonGroup className="w-full">
            <Button
              type="button"
              variant={config.pointcloud.latestScanMode === "brighter" ? "default" : "outline"}
              onClick={() => updatePointcloud("latestScanMode", "brighter")}
              className="flex-1"
            >
              Brighter
            </Button>
            <Button
              type="button"
              variant={config.pointcloud.latestScanMode === "brighter-red" ? "default" : "outline"}
              onClick={() => updatePointcloud("latestScanMode", "brighter-red")}
              className="flex-1"
            >
              Brighter + Red
            </Button>
          </ButtonGroup>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pointcloud-fov">Camera Field of View (FOV)</Label>
          <Input
            id="pointcloud-fov"
            type="number"
            min="30"
            max="150"
            step="5"
            value={config.pointcloud.fov}
            onChange={(e) => updatePointcloud("fov", parseFloat(e.target.value) || 90)}
            placeholder="90"
          />
        </div>
        <div className="flex items-center justify-between space-x-2">
          <Label htmlFor="dynamic-scaling" className="flex-1 cursor-pointer">
            Dynamic Latest Point Scaling
          </Label>
          <Switch
            id="dynamic-scaling"
            checked={config.pointcloud.dynamicLatestPointScaling}
            onCheckedChange={(checked) => updatePointcloud("dynamicLatestPointScaling", checked)}
          />
        </div>
      </div>

      {/* TF Block */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="tf-topic">TF Topic</Label>
          <Input
            id="tf-topic"
            value={config.tf.topic}
            onChange={(e) => updateTF("topic", e.target.value)}
            placeholder="/tf"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tf-smoothing">TF Smoothing</Label>
          <Input
            id="tf-smoothing"
            type="number"
            min="0"
            max="100"
            step="1"
            value={config.tf.smoothing}
            onChange={(e) => updateTF("smoothing", parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            0 = instant, 5-10 = light, 20-30 = medium, 50+ = heavy
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tf-follow-frame">Follow Frame ID</Label>
          <Input
            id="tf-follow-frame"
            type="text"
            value={config.tf.follow.frameId}
            onChange={(e) => updateTFFollow("frameId", e.target.value)}
            placeholder="body"
          />
          <p className="text-xs text-muted-foreground">
            TF frame to follow when Follow mode is enabled
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="camera-smoothing">Camera Smoothing</Label>
          <Input
            id="camera-smoothing"
            type="number"
            min="0"
            max="100"
            step="1"
            value={config.tf.follow.smoothing}
            onChange={(e) => updateTFFollow("smoothing", parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            0 = instant, 5-10 = light, 20-30 = medium, 50+ = heavy
          </p>
        </div>
      </div>
    </TabsContent>
  )
}
