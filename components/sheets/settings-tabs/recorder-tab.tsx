import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import type { AppConfig } from "@/lib/config/appConfig"

interface RecorderTabProps {
  config: AppConfig
  updateRecording: (field: keyof AppConfig["recording"], value: any) => void
}

export function RecorderTab({ config, updateRecording }: RecorderTabProps) {
  return (
    <TabsContent value="recorder" className="space-y-6 mt-4">
      {/* Mode Selector */}
      <div className="space-y-2">
        <Label>Recording Mode</Label>
        <ButtonGroup className="w-full">
          <Button
            type="button"
            variant={config.recording.mode === "video" ? "default" : "outline"}
            onClick={() => updateRecording("mode", "video")}
            className="flex-1"
          >
            Video (MP4)
          </Button>
          <Button
            type="button"
            variant={config.recording.mode === "png-sequence" ? "default" : "outline"}
            onClick={() => updateRecording("mode", "png-sequence")}
            className="flex-1"
          >
            PNG Sequence
          </Button>
        </ButtonGroup>
        <p className="text-xs text-muted-foreground">
          {config.recording.mode === 'video'
            ? 'WebCodecs MP4 (GPU-accelerated, instant playback)'
            : 'Lossless PNG/JPEG ZIP (CPU workers, requires ffmpeg for video)'}
        </p>
      </div>

      {/* FPS (common to both modes) */}
      <div className="space-y-2">
        <Label htmlFor="recording-fps">FPS (Frames Per Second)</Label>
        <Input
          id="recording-fps"
          type="number"
          min="1"
          max="120"
          value={config.recording.fps}
          onChange={(e) => {
            const value = parseInt(e.target.value)
            updateRecording("fps", isNaN(value) ? "" : value)
          }}
          placeholder="30"
        />
        <p className="text-xs text-muted-foreground">Common values: 15, 24, 30, 60</p>
      </div>

      {/* Video mode settings */}
      {config.recording.mode === 'video' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="recording-codec">Codec</Label>
            <ButtonGroup className="w-full">
              <Button
                type="button"
                variant={config.recording.codec === "h264" ? "default" : "outline"}
                onClick={() => updateRecording("codec", "h264")}
                className="flex-1"
              >
                H.264
              </Button>
              <Button
                type="button"
                variant={config.recording.codec === "vp9" ? "default" : "outline"}
                onClick={() => updateRecording("codec", "vp9")}
                className="flex-1"
              >
                VP9
              </Button>
            </ButtonGroup>
            <p className="text-xs text-muted-foreground">H.264 is faster and more compatible, VP9 has better quality/compression</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recording-bitrate">Bitrate (Mbps)</Label>
            <Input
              id="recording-bitrate"
              type="number"
              min="1"
              max="500"
              step="10"
              value={config.recording.bitrate}
              onChange={(e) => {
                const value = parseInt(e.target.value)
                updateRecording("bitrate", isNaN(value) ? "" : value)
              }}
              placeholder="100"
            />
            <p className="text-xs text-muted-foreground">Higher bitrate = better quality, larger file. Recommended: 50-100 Mbps</p>
          </div>
        </>
      )}

      {/* PNG-sequence mode settings */}
      {config.recording.mode === 'png-sequence' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="recording-format">Format</Label>
            <ButtonGroup className="w-full">
              <Button
                type="button"
                variant={config.recording.format === "jpeg" ? "default" : "outline"}
                onClick={() => updateRecording("format", "jpeg")}
                className="flex-1"
              >
                JPEG
              </Button>
              <Button
                type="button"
                variant={config.recording.format === "png" ? "default" : "outline"}
                onClick={() => updateRecording("format", "png")}
                className="flex-1"
              >
                PNG
              </Button>
            </ButtonGroup>
            <p className="text-xs text-muted-foreground">JPEG is faster, PNG is lossless</p>
          </div>

          {config.recording.format === 'jpeg' && (
            <div className="space-y-2">
              <Label htmlFor="recording-quality">JPEG Quality</Label>
              <Input
                id="recording-quality"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={config.recording.quality}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  updateRecording("quality", isNaN(value) ? "" : value)
                }}
                placeholder="0.95"
              />
              <p className="text-xs text-muted-foreground">0.0-1.0 (0.95 recommended for visually lossless)</p>
            </div>
          )}
        </>
      )}
    </TabsContent>
  )
}
