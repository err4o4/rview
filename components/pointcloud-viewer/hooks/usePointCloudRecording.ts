import { useState, useRef, useCallback } from "react"
import * as THREE from "three"
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource } from 'mediabunny'

export interface RecordingSettings {
  fps: number
  codec: 'h264' | 'vp9'
  bitrate: number // in Mbps
}

export interface UsePointCloudRecordingOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>
  settings: RecordingSettings
}

export type ProcessingPhase = 'finalizing' | null

export interface UsePointCloudRecordingResult {
  isRecording: boolean
  recordedFrameCount: number
  isPreparingVideo: boolean
  progress: number
  processingPhase: ProcessingPhase
  startRecording: () => void
  stopRecording: () => Promise<void>
  toggleRecording: () => void
}

/**
 * Custom hook for video recording using WebCodecs API.
 * Records canvas output directly to MP4 using GPU-accelerated encoding.
 *
 * Supports:
 * - H.264/AVC encoding (smaller files, wider compatibility)
 * - VP9 encoding (better quality/compression ratio)
 * - Configurable bitrate and frame rate
 * - Direct MP4 output (no post-processing needed)
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
  const [isPreparingVideo, setIsPreparingVideo] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>(null)

  // Recording refs
  const recordingAnimationFrameRef = useRef<number | null>(null)
  const frameCountRef = useRef<number>(0)
  const lastCaptureTimeRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  // Video encoder refs (WebCodecs via mediabunny)
  const videoOutputRef = useRef<Output<Mp4OutputFormat, BufferTarget> | null>(null)
  const videoSourceRef = useRef<CanvasSource | null>(null)

  const captureIntervalMs = 1000 / settings.fps

  const startRecording = useCallback(async () => {
    if (!canvasRef.current || !rendererRef.current) return

    try {
      // Reset state
      frameCountRef.current = 0
      lastCaptureTimeRef.current = performance.now()
      startTimeRef.current = performance.now()
      setRecordedFrameCount(0)
      setIsRecording(true)

      const codecName = settings.codec === 'vp9' ? 'VP9' : 'H.264'
      const bitrateBps = settings.bitrate * 1_000_000 // Convert Mbps to bps

      console.log(`🎥 Video recording started | FPS: ${settings.fps} | Codec: ${codecName} | Bitrate: ${settings.bitrate}Mbps`)

      // Debug WebCodecs availability
      console.log('🔍 WebCodecs Debug:')
      console.log('  - VideoEncoder available:', typeof VideoEncoder !== 'undefined')
      console.log('  - Secure context:', window.isSecureContext)

      try {
        // Create MP4 output with BufferTarget (writes to memory)
        const output = new Output({
          format: new Mp4OutputFormat(),
          target: new BufferTarget()
        })

        // Configure video source based on codec
        let videoSource: CanvasSource
        if (settings.codec === 'vp9') {
          console.log(`📐 Using VP9 encoding | Bitrate: ${settings.bitrate}Mbps`)
          videoSource = new CanvasSource(canvasRef.current, {
            codec: 'vp9',
            bitrate: bitrateBps
          })
        } else {
          console.log(`📐 Using H.264 encoding | Bitrate: ${settings.bitrate}Mbps`)
          videoSource = new CanvasSource(canvasRef.current, {
            codec: 'avc', // H.264/AVC
            bitrate: bitrateBps
          })
        }

        // Add video track to output
        output.addVideoTrack(videoSource)

        // Start the output
        await output.start()

        videoOutputRef.current = output
        videoSourceRef.current = videoSource

        console.log(`✅ WebCodecs initialized | Resolution: ${canvasRef.current.width}x${canvasRef.current.height}`)

        // Capture loop
        const captureFrame = async () => {
          if (!canvasRef.current || !videoSourceRef.current) return

          const now = performance.now()
          const elapsed = now - lastCaptureTimeRef.current

          // Only capture at specified FPS
          if (elapsed >= captureIntervalMs) {
            lastCaptureTimeRef.current = now
            frameCountRef.current++

            try {
              // Add current canvas state to video (handles encoding internally)
              const timestamp = (now - startTimeRef.current) / 1000 // seconds
              const duration = 1 / settings.fps // frame duration in seconds

              await videoSourceRef.current.add(timestamp, duration)
              setRecordedFrameCount(frameCountRef.current)
            } catch (err) {
              console.error('Failed to add frame to video:', err)
            }
          }

          // Continue capturing
          recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)
        }

        recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)

      } catch (err) {
        console.error('Failed to initialize WebCodecs:', err)
        setIsRecording(false)
        return
      }

    } catch (err) {
      console.error('Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [canvasRef, rendererRef, captureIntervalMs, settings.fps, settings.codec, settings.bitrate])

  const stopRecording = useCallback(async () => {
    if (recordingAnimationFrameRef.current === null) return

    // Stop capturing new frames
    cancelAnimationFrame(recordingAnimationFrameRef.current)
    recordingAnimationFrameRef.current = null
    setIsRecording(false)

    const totalFrames = frameCountRef.current

    if (totalFrames === 0) {
      console.warn('No frames captured')
      return
    }

    console.log(`\n⏹️  Video recording stopped | Captured: ${totalFrames} frames`)

    if (!videoOutputRef.current || !videoSourceRef.current) {
      console.error('❌ Video output not initialized')
      return
    }

    try {
      setIsPreparingVideo(true)
      setProcessingPhase('finalizing')
      setProgress(50)

      console.log('🎬 Finalizing video...')

      // Finalize the video (flushes encoder and writes file footer)
      await videoOutputRef.current.finalize()

      setProgress(75)

      // Get the MP4 buffer
      const buffer = videoOutputRef.current.target.buffer
      if (!buffer) {
        throw new Error('Video buffer is empty')
      }

      const blob = new Blob([buffer], { type: 'video/mp4' })
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(2)

      console.log(`✅ Video finalized | Size: ${sizeMB}MB`)

      setProgress(100)

      // Download the MP4 file
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const timestamp = Date.now()
      const duration = ((performance.now() - startTimeRef.current) / 1000).toFixed(1)
      const codecName = settings.codec === 'vp9' ? 'VP9' : 'H264'
      a.download = `pointcloud-${codecName}-${settings.bitrate}mbps-${totalFrames}frames-${duration}s-${timestamp}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`💾 Downloaded: ${a.download}`)
      console.log(`\n=== VIDEO RECORDING COMPLETE ===`)
      console.log(`Codec: ${codecName} | Frames: ${totalFrames} | Duration: ${duration}s | FPS: ${settings.fps} | Bitrate: ${settings.bitrate}Mbps | Size: ${sizeMB}MB`)

    } catch (err) {
      console.error('Failed to finalize video:', err)
    } finally {
      // Cleanup
      videoOutputRef.current = null
      videoSourceRef.current = null
      setIsPreparingVideo(false)
      setProgress(0)
      setProcessingPhase(null)
    }
  }, [settings.fps, settings.codec, settings.bitrate])

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
    isPreparingVideo,
    progress,
    processingPhase,
    startRecording,
    stopRecording,
    toggleRecording
  }
}
