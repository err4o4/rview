import { Navigation, Eye, EyeOff, Palette, RotateCcw, Video, Circle as RecordCircle, Box } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PointCloudControlsProps {
  cameraFollowEnabled: boolean
  cameraAngleLockEnabled: boolean
  onFollowCycle: () => void
  tfVisible: boolean
  showModel: boolean
  onTfVisibilityCycle: () => void
  latestScanHighlightEnabled: boolean
  latestScanMode: 'brighter-red' | 'brighter'
  onLatestScanHighlightToggle: () => void
  onClear: () => void
  isRecording: boolean
  onRecordingToggle: () => void
  recordingCodec: 'h264' | 'vp9'
  recordingFps: number
}

/**
 * Right-side toolbar with all point cloud control buttons
 */
export function PointCloudControls({
  cameraFollowEnabled,
  cameraAngleLockEnabled,
  onFollowCycle,
  tfVisible,
  showModel,
  onTfVisibilityCycle,
  latestScanHighlightEnabled,
  latestScanMode,
  onLatestScanHighlightToggle,
  onClear,
  isRecording,
  onRecordingToggle,
  recordingCodec,
  recordingFps,
}: PointCloudControlsProps) {
  const codecLabel = recordingCodec === 'vp9' ? 'VP9' : 'H.264'

  // Determine follow button state and styling
  const getFollowState = () => {
    if (!cameraFollowEnabled && !cameraAngleLockEnabled) {
      return { title: "Follow TF", color: "text-muted-foreground", border: "" }
    } else if (cameraFollowEnabled && !cameraAngleLockEnabled) {
      return { title: "Follow TF (click for lock)", color: "text-blue-500", border: "border-blue-500" }
    } else {
      return { title: "Follow TF + Lock Camera", color: "text-red-500", border: "border-red-500" }
    }
  }

  // Determine TF visibility button state and styling
  const getTfVisibilityState = () => {
    if (tfVisible && !showModel) {
      return {
        title: "TF Arrows (click for model)",
        color: "text-green-500",
        border: "border-green-500",
        icon: <Eye className="h-4 w-4" />
      }
    } else if (tfVisible && showModel) {
      return {
        title: "TF Model (click to hide)",
        color: "text-purple-500",
        border: "border-purple-500",
        icon: <Box className="h-4 w-4" />
      }
    } else {
      return {
        title: "TF Hidden (click for arrows)",
        color: "text-muted-foreground",
        border: "",
        icon: <EyeOff className="h-4 w-4" />
      }
    }
  }

  const followState = getFollowState()
  const tfVisibilityState = getTfVisibilityState()

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={onFollowCycle}
        title={followState.title}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${followState.color} ${followState.border}`}
      >
        <Navigation className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onTfVisibilityCycle}
        title={tfVisibilityState.title}
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${tfVisibilityState.color} ${tfVisibilityState.border}`}
      >
        {tfVisibilityState.icon}
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
        onClick={onRecordingToggle}
        title={isRecording
          ? "Stop recording (downloads MP4)"
          : `Start recording ${codecLabel} video (${recordingFps}fps)`
        }
        className={`h-8 w-8 bg-background/90 backdrop-blur-sm rounded-md border ${
          isRecording
            ? "text-red-500 border-red-500 animate-pulse"
            : "text-muted-foreground"
        }`}
      >
        {isRecording ? <RecordCircle className="h-4 w-4 fill-current" /> : <Video className="h-4 w-4" />}
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
    </div>
  )
}
