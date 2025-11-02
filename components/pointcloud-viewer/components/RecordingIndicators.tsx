import { memo } from "react"
import { Loader2, Circle as RecordCircle } from "lucide-react"
import type { ProcessingPhase } from "../hooks/usePointCloudRecording"

export interface RecordingIndicatorsProps {
  isRecording: boolean
  recordedFrameCount: number
  codec: 'h264' | 'vp9'
  fps: number
  bitrate: number
  isPreparingVideo: boolean
  progress: number
  processingPhase: ProcessingPhase
}

/**
 * Displays recording status and processing progress overlays
 * Shows codec, bitrate, FPS, and frame count during recording
 * Memoized to prevent unnecessary re-renders during recording
 */
export const RecordingIndicators = memo(function RecordingIndicators({
  isRecording,
  recordedFrameCount,
  codec,
  fps,
  bitrate,
  isPreparingVideo,
  progress,
  processingPhase
}: RecordingIndicatorsProps) {
  const codecLabel = codec === 'vp9' ? 'VP9' : 'H.264'
  const duration = (recordedFrameCount / fps).toFixed(1)

  return (
    <>
      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-full" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <RecordCircle className="h-3 w-3 fill-white animate-pulse" />
          <span className="text-xs font-medium text-white">
            Recording MP4 ({codecLabel}, {bitrate}Mbps): {recordedFrameCount} frames ({duration}s @ {fps}fps)
          </span>
        </div>
      )}

      {/* Processing Indicator */}
      {isPreparingVideo && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 px-4 py-3 bg-blue-500/90 backdrop-blur-sm rounded-lg" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
            <span className="text-sm font-medium text-white">
              Finalizing video...
            </span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-white h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-white/90">
            {progress}% - Encoding and saving MP4
          </span>
        </div>
      )}
    </>
  )
})
