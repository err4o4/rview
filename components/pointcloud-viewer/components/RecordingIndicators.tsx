import { memo } from "react"
import { Loader2, Circle as RecordCircle } from "lucide-react"
import type { ProcessingPhase } from "../hooks/usePointCloudRecording"

export interface RecordingIndicatorsProps {
  isRecording: boolean
  recordedFrameCount: number
  recordingFormat: 'jpeg' | 'png'
  recordingFps: number
  isPreparingZip: boolean
  zipProgress: number
  processingPhase: ProcessingPhase
}

/**
 * Displays recording status and ZIP preparation progress overlays
 * Memoized to prevent unnecessary re-renders during recording
 */
export const RecordingIndicators = memo(function RecordingIndicators({
  isRecording,
  recordedFrameCount,
  recordingFormat,
  recordingFps,
  isPreparingZip,
  zipProgress,
  processingPhase
}: RecordingIndicatorsProps) {
  // Get phase-specific message
  const getPhaseMessage = () => {
    switch (processingPhase) {
      case 'encoding':
        return 'Processing frames...'
      case 'adding':
        return 'Adding frames to ZIP...'
      case 'compressing':
        return 'Generating ZIP file...'
      default:
        return 'Preparing...'
    }
  }
  return (
    <>
      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-full" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <RecordCircle className="h-3 w-3 fill-white animate-pulse" />
          <span className="text-xs font-medium text-white">
            Recording {recordingFormat === 'jpeg' ? 'JPEG' : 'PNG'} sequence: {recordedFrameCount} frames ({(recordedFrameCount / recordingFps).toFixed(1)}s @ {recordingFps}fps)
          </span>
        </div>
      )}

      {/* ZIP Preparation Indicator */}
      {isPreparingZip && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 px-4 py-3 bg-blue-500/90 backdrop-blur-sm rounded-lg" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
            <span className="text-sm font-medium text-white">
              {getPhaseMessage()}
            </span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-white h-full transition-all duration-300 ease-out"
              style={{ width: `${zipProgress}%` }}
            />
          </div>
          <span className="text-xs text-white/90">
            {zipProgress}% - {getPhaseMessage()}
          </span>
        </div>
      )}
    </>
  )
})
