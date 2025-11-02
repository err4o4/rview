import { memo } from "react"
import { Loader2, Circle as RecordCircle } from "lucide-react"
import type { ProcessingPhase } from "../hooks/usePointCloudRecording"

export interface RecordingIndicatorsProps {
  isRecording: boolean
  recordedFrameCount: number
  mode: 'video' | 'png-sequence'
  codec: 'h264' | 'vp9'
  fps: number
  bitrate: number
  format: 'jpeg' | 'png'
  isProcessing: boolean
  progress: number
  processingPhase: ProcessingPhase
}

/**
 * Displays recording status and processing progress overlays
 * Supports both video (MP4) and PNG-sequence (ZIP) modes
 * Memoized to prevent unnecessary re-renders during recording
 */
export const RecordingIndicators = memo(function RecordingIndicators({
  isRecording,
  recordedFrameCount,
  mode,
  codec,
  fps,
  bitrate,
  format,
  isProcessing,
  progress,
  processingPhase
}: RecordingIndicatorsProps) {
  const isVideoMode = mode === 'video'
  const codecLabel = codec === 'vp9' ? 'VP9' : 'H.264'
  const formatLabel = format === 'png' ? 'PNG' : 'JPEG'
  const duration = (recordedFrameCount / fps).toFixed(1)

  // Get phase-specific message
  const getPhaseMessage = () => {
    if (isVideoMode) {
      return 'Finalizing video...'
    } else {
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
  }

  const getRecordingLabel = () => {
    if (isVideoMode) {
      return `Recording MP4 (${codecLabel}, ${bitrate}Mbps): ${recordedFrameCount} frames`
    } else {
      return `Recording ${formatLabel} sequence: ${recordedFrameCount} frames`
    }
  }

  return (
    <>
      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-full" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <RecordCircle className="h-3 w-3 fill-white animate-pulse" />
          <span className="text-xs font-medium text-white">
            {getRecordingLabel()} ({duration}s @ {fps}fps)
          </span>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
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
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-white/90">
            {progress}% - {getPhaseMessage()}
          </span>
        </div>
      )}
    </>
  )
})
