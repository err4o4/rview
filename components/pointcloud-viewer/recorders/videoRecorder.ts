import { Output, Mp4OutputFormat, BufferTarget, CanvasSource } from 'mediabunny'
import type { BlobRequest, BlobResponse, ErrorResponse } from '../workers/videoDownloader.worker'

export interface VideoRecorderSettings {
  fps: number
  codec: 'h264' | 'vp9'
  bitrate: number // in Mbps
}

export interface VideoRecorderState {
  isRecording: boolean
  recordedFrameCount: number
  isProcessing: boolean
  progress: number
  currentSegment: number
  estimatedSizeMB: number
}

export class VideoRecorder {
  private canvasRef: HTMLCanvasElement | null = null
  private videoOutput: Output<Mp4OutputFormat, BufferTarget> | null = null
  private videoSource: CanvasSource | null = null
  private animationFrameId: number | null = null
  private frameCount: number = 0
  private totalFrameCount: number = 0 // Total across all segments
  private lastCaptureTime: number = 0
  private startTime: number = 0
  private segmentStartTime: number = 0
  private settings: VideoRecorderSettings
  private onStateChange: (state: VideoRecorderState) => void

  // State tracking
  private isProcessing: boolean = false
  private progress: number = 0
  private currentSegment: number = 1
  private estimatedSizeMB: number = 0

  // Segmented recording
  private readonly MAX_SEGMENT_SIZE_MB = 1000 // 3.5GB to stay under 4GB limit
  private downloadWorker: Worker | null = null
  private recordingSessionStart: number = 0

  constructor(settings: VideoRecorderSettings, onStateChange: (state: VideoRecorderState) => void) {
    this.settings = settings
    this.onStateChange = onStateChange
  }

  private getState(): VideoRecorderState {
    return {
      isRecording: this.animationFrameId !== null,
      recordedFrameCount: this.totalFrameCount,
      isProcessing: this.isProcessing,
      progress: this.progress,
      currentSegment: this.currentSegment,
      estimatedSizeMB: this.estimatedSizeMB
    }
  }

  private estimateSegmentSize(): number {
    // Estimate based on bitrate with conservative overhead
    // The buffer is only available after finalize(), so we must estimate during recording
    const elapsedSeconds = (performance.now() - this.segmentStartTime) / 1000
    const bitrateMbps = this.settings.bitrate

    // Base size calculation: (bitrate in Mbps * seconds) / 8 to convert to MB
    const baseSizeMB = (bitrateMbps * elapsedSeconds) / 8

    // Conservative overhead factors:
    // - MP4 container: ~5-10%
    // - Keyframes: ~10-20% (depends on GOP size)
    // - Codec metadata and headers: ~5-10%
    // - Buffer padding and encoding variations: ~10-20%
    // Total: Use 50% overhead to be safe and avoid exceeding limit
    const overheadMultiplier = 1.0

    return baseSizeMB * overheadMultiplier
  }

  private updateState(partial: Partial<VideoRecorderState>) {
    // Update instance variables
    if (partial.isProcessing !== undefined) this.isProcessing = partial.isProcessing
    if (partial.progress !== undefined) this.progress = partial.progress

    // Notify listeners
    this.onStateChange({ ...this.getState(), ...partial })
  }

  async start(canvas: HTMLCanvasElement): Promise<void> {
    if (this.animationFrameId !== null) {
      throw new Error('Recording already in progress')
    }

    this.canvasRef = canvas
    this.totalFrameCount = 0
    this.currentSegment = 1
    this.recordingSessionStart = Date.now()
    this.estimatedSizeMB = 0

    // Initialize download worker
    this.downloadWorker = new Worker(
      new URL('../workers/videoDownloader.worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.downloadWorker.onmessage = (e: MessageEvent<BlobResponse | ErrorResponse>) => {
      if (e.data.type === 'error') {
        console.error('Worker blob creation failed:', e.data.error)
        return
      }

      // Download the blob on main thread (workers don't have DOM access)
      const { blob, filename, sizeMB } = e.data
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`Segment saved: ${filename} (${sizeMB.toFixed(0)}MB)`)
    }

    // Start first segment
    await this.startNewSegment()

    // Start capture loop
    this.updateState({ isRecording: true })
    this.captureLoop()
  }

  private async startNewSegment(): Promise<void> {
    const bitrateBps = this.settings.bitrate * 1_000_000

    // Create MP4 output for this segment
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    })

    // Configure video source based on codec
    let videoSource: CanvasSource
    if (this.settings.codec === 'vp9') {
      videoSource = new CanvasSource(this.canvasRef!, {
        codec: 'vp9',
        bitrate: bitrateBps
      })
    } else {
      videoSource = new CanvasSource(this.canvasRef!, {
        codec: 'avc',
        bitrate: bitrateBps
      })
    }

    output.addVideoTrack(videoSource)
    await output.start()

    this.videoOutput = output
    this.videoSource = videoSource
    this.frameCount = 0
    this.segmentStartTime = performance.now()
    this.startTime = performance.now()
    this.lastCaptureTime = performance.now()
  }

  private captureLoop = async () => {
    if (!this.canvasRef || !this.videoSource) return

    const now = performance.now()
    const elapsed = now - this.lastCaptureTime
    const captureIntervalMs = 1000 / this.settings.fps

    // Check segment size every ~60 frames (every 1-2 seconds at 30-60fps)
    if (this.frameCount > 0 && this.frameCount % 60 === 0) {
      this.estimatedSizeMB = this.estimateSegmentSize()

      // If approaching limit, finalize this segment and start a new one
      if (this.estimatedSizeMB >= this.MAX_SEGMENT_SIZE_MB) {
        console.log(`Segment ${this.currentSegment} reached size limit (${this.estimatedSizeMB.toFixed(0)}MB). Starting new segment...`)
        await this.finalizeCurrentSegment()
        await this.startNewSegment()
        this.currentSegment++
        this.updateState({ currentSegment: this.currentSegment, estimatedSizeMB: 0 })
      } else {
        this.updateState({ estimatedSizeMB: this.estimatedSizeMB })
      }
    }

    if (elapsed >= captureIntervalMs) {
      this.lastCaptureTime = now
      this.frameCount++
      this.totalFrameCount++

      try {
        const timestamp = (now - this.startTime) / 1000
        const duration = 1 / this.settings.fps

        await this.videoSource.add(timestamp, duration)
        this.updateState({ recordedFrameCount: this.totalFrameCount })
      } catch (err) {
        console.error('Failed to add frame to video:', err)
      }
    }

    this.animationFrameId = requestAnimationFrame(this.captureLoop)
  }

  private async finalizeCurrentSegment(): Promise<void> {
    if (!this.videoOutput || !this.videoSource) return

    try {
      // Finalize the segment
      await this.videoOutput.finalize()

      // Get buffer
      const buffer = this.videoOutput.target.buffer
      if (!buffer) {
        console.error('Segment buffer is empty')
        return
      }

      // Generate filename for this segment
      const duration = ((performance.now() - this.segmentStartTime) / 1000).toFixed(1)
      const codecName = this.settings.codec === 'vp9' ? 'VP9' : 'H264'
      const filename = `pointcloud-${codecName}-${this.settings.bitrate}mbps-segment${this.currentSegment}-${this.frameCount}frames-${duration}s-${this.recordingSessionStart}.mp4`

      // Send to worker for blob creation (non-blocking)
      if (this.downloadWorker) {
        const request: BlobRequest = {
          type: 'createBlob',
          buffer: buffer,
          filename
        }
        this.downloadWorker.postMessage(request, [buffer])
      }
    } catch (err) {
      console.error('Failed to finalize segment:', err)
    }
  }

  async stop(): Promise<void> {
    if (this.animationFrameId === null) {
      return
    }

    // Stop capture loop
    cancelAnimationFrame(this.animationFrameId)
    this.animationFrameId = null

    if (this.frameCount === 0) {
      this.updateState({ isRecording: false })
      return
    }

    if (!this.videoOutput || !this.videoSource) {
      console.error('Video output not initialized')
      this.updateState({ isRecording: false })
      return
    }

    try {
      this.updateState({ isRecording: false, isProcessing: true, progress: 50 })

      // Finalize last segment
      await this.videoOutput.finalize()

      this.updateState({ progress: 75 })

      // Get MP4 buffer
      const buffer = this.videoOutput.target.buffer
      if (!buffer) {
        throw new Error('Video buffer is empty')
      }

      this.updateState({ progress: 100 })

      // Generate filename for final segment
      const duration = ((performance.now() - this.segmentStartTime) / 1000).toFixed(1)
      const codecName = this.settings.codec === 'vp9' ? 'VP9' : 'H264'
      const segmentSuffix = this.currentSegment > 1 ? `-segment${this.currentSegment}` : ''
      const filename = `pointcloud-${codecName}-${this.settings.bitrate}mbps${segmentSuffix}-${this.frameCount}frames-${duration}s-${this.recordingSessionStart}.mp4`

      // Download final segment
      const blob = new Blob([buffer], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (this.currentSegment > 1) {
        console.log(`Recording complete: ${this.currentSegment} segments, ${this.totalFrameCount} total frames`)
      }
    } catch (err) {
      console.error('Failed to finalize video:', err)
    } finally {
      // Cleanup
      this.videoOutput = null
      this.videoSource = null
      if (this.downloadWorker) {
        this.downloadWorker.terminate()
        this.downloadWorker = null
      }
      this.updateState({ isProcessing: false, progress: 0 })
    }
  }

  updateSettings(settings: VideoRecorderSettings): void {
    this.settings = settings
  }

  cleanup(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.videoOutput = null
    this.videoSource = null
    this.canvasRef = null
    if (this.downloadWorker) {
      this.downloadWorker.terminate()
      this.downloadWorker = null
    }

    // Reset state
    this.isProcessing = false
    this.progress = 0
    this.currentSegment = 1
    this.estimatedSizeMB = 0
  }
}
