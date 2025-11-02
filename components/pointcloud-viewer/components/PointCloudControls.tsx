import { Navigation, Lock, Eye, EyeOff, Palette, RotateCcw, Video, Circle as RecordCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PointCloudControlsProps {
  cameraFollowEnabled: boolean
  onCameraFollowToggle: () => void
  cameraAngleLockEnabled: boolean
  onCameraAngleLockToggle: () => void
  tfVisible: boolean
  onTfVisibleToggle: () => void
  latestScanHighlightEnabled: boolean
  latestScanMode: 'brighter-red' | 'brighter'
  onLatestScanHighlightToggle: () => void
  onClear: () => void
  isRecording: boolean
  onRecordingToggle: () => void
  recordingFormat: 'jpeg' | 'png'
  recordingFps: number
}

/**
 * Right-side toolbar with all point cloud control buttons
 */
export function PointCloudControls({
  cameraFollowEnabled,
  onCameraFollowToggle,
  cameraAngleLockEnabled,
  onCameraAngleLockToggle,
  tfVisible,
  onTfVisibleToggle,
  latestScanHighlightEnabled,
  latestScanMode,
  onLatestScanHighlightToggle,
  onClear,
  isRecording,
  onRecordingToggle,
  recordingFormat,
  recordingFps
}: PointCloudControlsProps) {
  return (
    <div className="absolute right-4 z-10 flex items-center gap-2" style={{ top: 'calc(3rem + env(safe-area-inset-top) + 0.5rem)' }}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCameraFollowToggle}
        title={cameraFollowEnabled ? "Disable camera follow" : "Enable camera follow"}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          cameraFollowEnabled
            ? "text-blue-500 border-blue-500"
            : "text-muted-foreground"
        }`}
      >
        <Navigation className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCameraAngleLockToggle}
        title={cameraAngleLockEnabled ? "Disable angle lock" : "Enable angle lock"}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          cameraAngleLockEnabled
            ? "text-red-500 border-red-500"
            : "text-muted-foreground"
        }`}
      >
        <Lock className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onTfVisibleToggle}
        title={tfVisible ? "Hide TF arrows" : "Show TF arrows"}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          tfVisible
            ? "text-green-500 border-green-500"
            : "text-muted-foreground"
        }`}
      >
        {tfVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLatestScanHighlightToggle}
        title={latestScanHighlightEnabled ? "Disable latest scan highlight" : "Enable latest scan highlight"}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          latestScanHighlightEnabled
            ? latestScanMode === "brighter-red"
              ? "text-red-500 border-red-500"
              : "text-yellow-500 border-yellow-500"
            : "text-muted-foreground"
        }`}
      >
        <Palette className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        title="Clear points"
        className="h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border text-muted-foreground"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRecordingToggle}
        title={isRecording
          ? "Stop recording (downloads as ZIP)"
          : `Start recording ${recordingFormat === 'jpeg' ? 'JPEG' : 'PNG'} sequence (${recordingFps}fps${recordingFormat === 'jpeg' ? ', optimized for speed' : ', lossless'})`
        }
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          isRecording
            ? "text-red-500 border-red-500 animate-pulse"
            : "text-muted-foreground"
        }`}
      >
        {isRecording ? <RecordCircle className="h-4 w-4 fill-current" /> : <Video className="h-4 w-4" />}
      </Button>
    </div>
  )
}
