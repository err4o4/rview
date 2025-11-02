import { useState, useRef, useCallback, useEffect } from "react"
import * as THREE from "three"
import { VideoRecorder, type VideoRecorderSettings, type VideoRecorderState } from "../recorders/videoRecorder"
import { PngRecorder, type PngRecorderSettings, type PngRecorderState } from "../recorders/pngRecorder"

export interface RecordingSettings {
  mode: 'video' | 'png-sequence'
  fps: number
  // Video mode settings
  codec: 'h264' | 'vp9'
  bitrate: number
  // PNG-sequence mode settings
  format: 'jpeg' | 'png'
  quality: number
}

export interface UsePointCloudRecordingOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>
  settings: RecordingSettings
}

export type ProcessingPhase = 'encoding' | 'adding' | 'compressing' | 'finalizing' | null

export interface UsePointCloudRecordingResult {
  isRecording: boolean
  recordedFrameCount: number
  isProcessing: boolean
  progress: number
  processingPhase: ProcessingPhase
  startRecording: () => void
  stopRecording: () => Promise<void>
  toggleRecording: () => void
}

/**
 * Custom hook for screen recording with two recorder modes:
 *
 * VIDEO MODE (mode: 'video'):
 * - Uses WebCodecs API for direct MP4 encoding
 * - GPU-accelerated H.264 or VP9 encoding
 * - Direct MP4 output (no post-processing needed)
 * - Lower RAM usage, instant playback
 *
 * PNG-SEQUENCE MODE (mode: 'png-sequence'):
 * - Multi-worker parallel encoding to PNG/JPEG
 * - True lossless PNG or high-quality JPEG
 * - ZIP output (requires ffmpeg for video conversion)
 * - Higher quality, more flexible post-processing
 *
 * @param options - Configuration options including canvas/renderer refs and settings
 * @returns Recording state and control functions
 */
export function usePointCloudRecording({
  canvasRef,
  rendererRef,
  settings
}: UsePointCloudRecordingOptions): UsePointCloudRecordingResult {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrameCount, setRecordedFrameCount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>(null)

  // Recorder instances
  const videoRecorderRef = useRef<VideoRecorder | null>(null)
  const pngRecorderRef = useRef<PngRecorder | null>(null)

  const isVideoMode = settings.mode === 'video'

  // State change handler for recorders
  const handleVideoStateChange = useCallback((state: VideoRecorderState) => {
    setIsRecording(state.isRecording)
    setRecordedFrameCount(state.recordedFrameCount)
    setIsProcessing(state.isProcessing)
    setProgress(state.progress)
    setProcessingPhase(state.isProcessing ? 'finalizing' : null)
  }, [])

  const handlePngStateChange = useCallback((state: PngRecorderState) => {
    setIsRecording(state.isRecording)
    setRecordedFrameCount(state.recordedFrameCount)
    setIsProcessing(state.isProcessing)
    setProgress(state.progress)
    setProcessingPhase(state.phase)
  }, [])

  // Initialize recorders
  useEffect(() => {
    if (isVideoMode) {
      if (!videoRecorderRef.current) {
        const videoSettings: VideoRecorderSettings = {
          fps: settings.fps,
          codec: settings.codec,
          bitrate: settings.bitrate
        }
        videoRecorderRef.current = new VideoRecorder(videoSettings, handleVideoStateChange)
      } else {
        videoRecorderRef.current.updateSettings({
          fps: settings.fps,
          codec: settings.codec,
          bitrate: settings.bitrate
        })
      }
    } else {
      if (!pngRecorderRef.current) {
        const pngSettings: PngRecorderSettings = {
          fps: settings.fps,
          format: settings.format,
          quality: settings.quality
        }
        pngRecorderRef.current = new PngRecorder(pngSettings, handlePngStateChange)
      } else {
        pngRecorderRef.current.updateSettings({
          fps: settings.fps,
          format: settings.format,
          quality: settings.quality
        })
      }
    }
  }, [isVideoMode, settings, handleVideoStateChange, handlePngStateChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoRecorderRef.current?.cleanup()
      pngRecorderRef.current?.cleanup()
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!canvasRef.current || !rendererRef.current) {
      console.error('Canvas or renderer not available')
      return
    }

    try {
      if (isVideoMode) {
        if (!videoRecorderRef.current) {
          throw new Error('Video recorder not initialized')
        }
        await videoRecorderRef.current.start(canvasRef.current)
      } else {
        if (!pngRecorderRef.current) {
          throw new Error('PNG recorder not initialized')
        }
        await pngRecorderRef.current.start(canvasRef.current)
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [canvasRef, rendererRef, isVideoMode])

  const stopRecording = useCallback(async () => {
    try {
      if (isVideoMode) {
        await videoRecorderRef.current?.stop()
      } else {
        await pngRecorderRef.current?.stop()
      }
    } catch (err) {
      console.error('Failed to stop recording:', err)
    }
  }, [isVideoMode])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    recordedFrameCount,
    isProcessing,
    progress,
    processingPhase,
    startRecording,
    stopRecording,
    toggleRecording
  }
}
