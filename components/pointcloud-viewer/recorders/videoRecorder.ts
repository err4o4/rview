import { Output, Mp4OutputFormat, BufferTarget, CanvasSource } from 'mediabunny'

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
}

export class VideoRecorder {
  private canvasRef: HTMLCanvasElement | null = null
  private videoOutput: Output<Mp4OutputFormat, BufferTarget> | null = null
  private videoSource: CanvasSource | null = null
  private animationFrameId: number | null = null
  private frameCount: number = 0
  private lastCaptureTime: number = 0
  private startTime: number = 0
  private settings: VideoRecorderSettings
  private onStateChange: (state: VideoRecorderState) => void

  // State tracking
  private isProcessing: boolean = false
  private progress: number = 0

  constructor(settings: VideoRecorderSettings, onStateChange: (state: VideoRecorderState) => void) {
    this.settings = settings
    this.onStateChange = onStateChange
  }

  private getState(): VideoRecorderState {
    return {
      isRecording: this.animationFrameId !== null,
      recordedFrameCount: this.frameCount,
      isProcessing: this.isProcessing,
      progress: this.progress
    }
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
    this.frameCount = 0
    this.lastCaptureTime = performance.now()
    this.startTime = performance.now()

    const codecName = this.settings.codec === 'vp9' ? 'VP9' : 'H.264'
    const bitrateBps = this.settings.bitrate * 1_000_000

    console.log(`🎥 Video recording started | FPS: ${this.settings.fps} | Codec: ${codecName} | Bitrate: ${this.settings.bitrate}Mbps`)

    // Debug WebCodecs availability
    console.log('🔍 WebCodecs Debug:')
    console.log('  - VideoEncoder available:', typeof VideoEncoder !== 'undefined')
    console.log('  - Secure context:', window.isSecureContext)

    // Create MP4 output
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    })

    // Configure video source based on codec
    let videoSource: CanvasSource
    if (this.settings.codec === 'vp9') {
      console.log(`📐 Using VP9 encoding | Bitrate: ${this.settings.bitrate}Mbps`)
      videoSource = new CanvasSource(canvas, {
        codec: 'vp9',
        bitrate: bitrateBps
      })
    } else {
      console.log(`📐 Using H.264 encoding | Bitrate: ${this.settings.bitrate}Mbps`)
      videoSource = new CanvasSource(canvas, {
        codec: 'avc',
        bitrate: bitrateBps
      })
    }

    output.addVideoTrack(videoSource)
    await output.start()

    this.videoOutput = output
    this.videoSource = videoSource

    console.log(`✅ WebCodecs initialized | Resolution: ${canvas.width}x${canvas.height}`)

    // Start capture loop
    this.updateState({ isRecording: true })
    this.captureLoop()
  }

  private captureLoop = async () => {
    if (!this.canvasRef || !this.videoSource) return

    const now = performance.now()
    const elapsed = now - this.lastCaptureTime
    const captureIntervalMs = 1000 / this.settings.fps

    if (elapsed >= captureIntervalMs) {
      this.lastCaptureTime = now
      this.frameCount++

      try {
        const timestamp = (now - this.startTime) / 1000
        const duration = 1 / this.settings.fps

        await this.videoSource.add(timestamp, duration)
        this.updateState({ recordedFrameCount: this.frameCount })
      } catch (err) {
        console.error('Failed to add frame to video:', err)
      }
    }

    this.animationFrameId = requestAnimationFrame(this.captureLoop)
  }

  async stop(): Promise<void> {
    if (this.animationFrameId === null) {
      console.warn('No recording in progress')
      return
    }

    // Stop capture loop
    cancelAnimationFrame(this.animationFrameId)
    this.animationFrameId = null

    const totalFrames = this.frameCount

    if (totalFrames === 0) {
      console.warn('No frames captured')
      this.updateState({ isRecording: false })
      return
    }

    console.log(`\n⏹️  Video recording stopped | Captured: ${totalFrames} frames`)

    if (!this.videoOutput || !this.videoSource) {
      console.error('❌ Video output not initialized')
      this.updateState({ isRecording: false })
      return
    }

    try {
      this.updateState({ isRecording: false, isProcessing: true, progress: 50 })

      console.log('🎬 Finalizing video...')

      // Finalize video
      await this.videoOutput.finalize()

      this.updateState({ progress: 75 })

      // Get MP4 buffer
      const buffer = this.videoOutput.target.buffer
      if (!buffer) {
        throw new Error('Video buffer is empty')
      }

      const blob = new Blob([buffer], { type: 'video/mp4' })
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(2)

      console.log(`✅ Video finalized | Size: ${sizeMB}MB`)

      this.updateState({ progress: 100 })

      // Download MP4
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const timestamp = Date.now()
      const duration = ((performance.now() - this.startTime) / 1000).toFixed(1)
      const codecName = this.settings.codec === 'vp9' ? 'VP9' : 'H264'
      a.download = `pointcloud-${codecName}-${this.settings.bitrate}mbps-${totalFrames}frames-${duration}s-${timestamp}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`💾 Downloaded: ${a.download}`)
      console.log(`\n=== VIDEO RECORDING COMPLETE ===`)
      console.log(`Codec: ${codecName} | Frames: ${totalFrames} | Duration: ${duration}s | FPS: ${this.settings.fps} | Bitrate: ${this.settings.bitrate}Mbps | Size: ${sizeMB}MB`)

    } catch (err) {
      console.error('Failed to finalize video:', err)
    } finally {
      // Cleanup
      this.videoOutput = null
      this.videoSource = null
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

    // Reset state
    this.isProcessing = false
    this.progress = 0
  }
}
