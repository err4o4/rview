import JSZip from 'jszip'

export interface PngRecorderSettings {
  fps: number
  format: 'jpeg' | 'png'
  quality: number // 0.0-1.0 for JPEG, ignored for PNG
}

export interface PngRecorderState {
  isRecording: boolean
  recordedFrameCount: number
  isProcessing: boolean
  progress: number
  phase: 'encoding' | 'adding' | 'compressing' | null
}

export class PngRecorder {
  private canvasRef: HTMLCanvasElement | null = null
  private animationFrameId: number | null = null
  private frameCount: number = 0
  private lastCaptureTime: number = 0
  private startTime: number = 0
  private settings: PngRecorderSettings
  private onStateChange: (state: PngRecorderState) => void

  // State tracking
  private isProcessing: boolean = false
  private progress: number = 0
  private phase: 'encoding' | 'adding' | 'compressing' | null = null

  // Worker pool
  private workerPool: Worker[] = []
  private workerReadyCount: number = 0
  private nextWorkerIndex: number = 0
  private readonly WORKER_COUNT: number

  // Streaming encoding queue
  private pendingFrames: { index: number; imageBitmap: ImageBitmap }[] = []
  private framesInFlight: number = 0
  private encodedCount: number = 0
  private encodedBlobs: (Blob | null)[] = []
  private statusLogInterval: NodeJS.Timeout | null = null
  private frameSizeMB: number = 0
  private readonly FRAMES_PER_WORKER = 20
  private readonly BATCH_SIZE: number

  constructor(settings: PngRecorderSettings, onStateChange: (state: PngRecorderState) => void) {
    this.settings = settings
    this.onStateChange = onStateChange
    this.WORKER_COUNT = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8))
    this.BATCH_SIZE = this.WORKER_COUNT * this.FRAMES_PER_WORKER
  }

  private getState(): PngRecorderState {
    return {
      isRecording: this.animationFrameId !== null,
      recordedFrameCount: this.frameCount,
      isProcessing: this.isProcessing,
      progress: this.progress,
      phase: this.phase
    }
  }

  private updateState(partial: Partial<PngRecorderState>) {
    // Update instance variables
    if (partial.isProcessing !== undefined) this.isProcessing = partial.isProcessing
    if (partial.progress !== undefined) this.progress = partial.progress
    if (partial.phase !== undefined) this.phase = partial.phase

    // Notify listeners
    this.onStateChange({ ...this.getState(), ...partial })
  }

  private sendFramesToWorker = () => {
    if (this.workerPool.length === 0) return

    while (this.pendingFrames.length > 0 && this.framesInFlight < this.BATCH_SIZE) {
      const frame = this.pendingFrames.shift()
      if (!frame) break

      const workerIndex = this.nextWorkerIndex
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.WORKER_COUNT
      this.framesInFlight++

      const mimeType = this.settings.format === 'jpeg' ? 'image/jpeg' : 'image/png'
      this.workerPool[workerIndex].postMessage(
        {
          type: 'encode_frame',
          frameIndex: frame.index,
          imageBitmap: frame.imageBitmap,
          mimeType,
          quality: this.settings.quality,
          totalFrames: 0
        },
        [frame.imageBitmap]
      )
    }
  }

  private initializeWorkers(): Promise<void> {
    return new Promise((resolve) => {
      console.log(`🔧 Initializing ${this.WORKER_COUNT} encoding workers (CPU cores: ${navigator.hardwareConcurrency || 'unknown'})`)

      this.workerPool = []
      this.workerReadyCount = 0

      for (let i = 0; i < this.WORKER_COUNT; i++) {
        const worker = new Worker(
          new URL('../workers/recording.worker.ts', import.meta.url),
          { type: 'module' }
        )

        worker.onmessage = (e) => {
          if (e.data.type === 'ready') {
            this.workerReadyCount++
            if (this.workerReadyCount === this.WORKER_COUNT) {
              console.log(`✅ All ${this.WORKER_COUNT} workers ready`)
              resolve()
            }
          } else if (e.data.type === 'encoded') {
            const { frameIndex, blob } = e.data
            this.encodedBlobs[frameIndex] = blob
            this.framesInFlight--
            this.encodedCount++
            this.sendFramesToWorker()
          } else if (e.data.type === 'error') {
            console.error(`Worker encoding error (frame ${e.data.frameIndex}):`, e.data.error)
            this.framesInFlight--
            this.sendFramesToWorker()
          }
        }

        this.workerPool.push(worker)
      }
    })
  }

  async start(canvas: HTMLCanvasElement): Promise<void> {
    if (this.animationFrameId !== null) {
      throw new Error('Recording already in progress')
    }

    // Initialize workers if not already done
    if (this.workerPool.length === 0) {
      await this.initializeWorkers()
    }

    this.canvasRef = canvas
    this.frameCount = 0
    this.lastCaptureTime = performance.now()
    this.startTime = performance.now()
    this.pendingFrames = []
    this.encodedBlobs = []
    this.framesInFlight = 0
    this.encodedCount = 0
    this.frameSizeMB = 0

    console.log(`🎬 PNG/JPEG sequence recording started | Format: ${this.settings.format.toUpperCase()} | FPS: ${this.settings.fps} | Quality: ${this.settings.quality}`)
    console.log(`🔄 Streaming encoding enabled with ${this.WORKER_COUNT} parallel workers`)

    // Start status logging
    this.statusLogInterval = setInterval(() => {
      const totalCaptured = this.frameCount
      const inQueue = this.pendingFrames.length
      const inFlight = this.framesInFlight
      const encoded = this.encodedCount
      const inRAM = inQueue + inFlight
      const ramUsageMB = this.frameSizeMB * inRAM

      console.log(
        `📊 Status: Total=${totalCaptured} | In RAM=${inRAM} (${ramUsageMB.toFixed(0)}MB) | Encoding=${inFlight} | Encoded=${encoded}`
      )
    }, 1000)
    

    this.updateState({ isRecording: true })
    this.captureLoop()
  }

  private captureLoop = async () => {
    if (!this.canvasRef) return

    const now = performance.now()
    const elapsed = now - this.lastCaptureTime
    const captureIntervalMs = 1000 / this.settings.fps

    if (elapsed >= captureIntervalMs) {
      this.lastCaptureTime = now
      const frameIndex = this.frameCount
      this.frameCount++

      try {
        const imageBitmap = await createImageBitmap(this.canvasRef)

        this.pendingFrames.push({
          index: frameIndex,
          imageBitmap
        })

        this.updateState({ recordedFrameCount: frameIndex + 1 })
        this.sendFramesToWorker()
      } catch (err) {
        console.error('Failed to capture frame:', err)
      }
    }

    this.animationFrameId = requestAnimationFrame(this.captureLoop)
  }

  async stop(): Promise<void> {
    if (this.animationFrameId === null) {
      return
    }

    // Stop capture loop
    cancelAnimationFrame(this.animationFrameId)
    this.animationFrameId = null

    const totalFrames = this.frameCount

    if (totalFrames === 0) {
      this.updateState({ isRecording: false })
      return
    }

    const remaining = this.pendingFrames.length + this.framesInFlight
    console.log(`\n⏹️  Recording stopped | Captured: ${totalFrames} | Encoded: ${this.encodedCount} | Remaining: ${remaining}`)

    // Phase 1: Wait for remaining frames to encode
    this.updateState({ isRecording: false, isProcessing: true, progress: 0, phase: 'encoding' })

    console.log(`⏳ Waiting for ${remaining} frames to finish encoding...`)

    while (this.pendingFrames.length > 0 || this.framesInFlight > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
      const currentRemaining = this.pendingFrames.length + this.framesInFlight
      const encodedSoFar = totalFrames - currentRemaining
      const progress = Math.floor((encodedSoFar / totalFrames) * 40)
      this.updateState({ progress })
    }

    console.log(`✅ All frames encoded | Total: ${totalFrames}`)

    // Calculate total size and determine chunking strategy
    let totalSizeMB = 0
    for (const blob of this.encodedBlobs) {
      if (blob) totalSizeMB += blob.size / (1024 * 1024)
    }

    console.log(`📊 Total frame data: ${totalSizeMB.toFixed(0)}MB across ${totalFrames} frames`)

    // Split into chunks of max 500MB to avoid memory issues
    const MAX_CHUNK_SIZE_MB = 1500
    const avgFrameSizeMB = totalSizeMB / totalFrames
    const framesPerChunk = Math.floor(MAX_CHUNK_SIZE_MB / avgFrameSizeMB)
    const needsChunking = totalSizeMB > MAX_CHUNK_SIZE_MB
    const numChunks = needsChunking ? Math.ceil(totalFrames / framesPerChunk) : 1

    if (needsChunking) {
      console.log(`📦 Splitting into ${numChunks} ZIP files (${framesPerChunk} frames each, ~${MAX_CHUNK_SIZE_MB}MB per file)`)
    }

    // Phase 2: Create ZIP file(s)
    this.updateState({ progress: 40, phase: 'compressing' })

    try {
      const extension = this.settings.format === 'jpeg' ? 'jpg' : 'png'
      const padLength = totalFrames.toString().length
      const timestamp = Date.now()
      const duration = ((performance.now() - this.startTime) / 1000).toFixed(1)

      for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
        const startFrame = chunkIndex * framesPerChunk
        const endFrame = Math.min(startFrame + framesPerChunk, totalFrames)
        const framesInChunk = endFrame - startFrame

        console.log(`📦 Creating ZIP ${chunkIndex + 1}/${numChunks} with frames ${startFrame}-${endFrame - 1} (${framesInChunk} frames)...`)

        const zip = new JSZip()
        const folder = zip.folder('frames')
        if (!folder) throw new Error('Failed to create ZIP folder')

        // Add frames to this chunk
        for (let i = startFrame; i < endFrame; i++) {
          const blob = this.encodedBlobs[i]
          if (!blob) {
            console.warn(`⚠️  Missing frame ${i}, skipping`)
            continue
          }

          const paddedIndex = i.toString().padStart(padLength, '0')
          folder.file(`frame_${paddedIndex}.${extension}`, blob)

          const totalProgress = 40 + Math.floor(((i + 1) / totalFrames) * 30)
          this.updateState({ progress: totalProgress })

          if ((i + 1) % 100 === 0 || i === endFrame - 1) {
            console.log(`📦 Added ${i + 1 - startFrame}/${framesInChunk} frames to ZIP ${chunkIndex + 1}`)
          }
        }

        console.log(`🗜️  Compressing ZIP ${chunkIndex + 1}/${numChunks}...`)

        const zipBlob = await zip.generateAsync(
          { type: 'blob', compression: 'STORE' },
          (metadata) => {
            const progressPerChunk = 30 / numChunks
            const baseProgress = 70 + (chunkIndex * progressPerChunk)
            const withinChunkProgress = (metadata.percent / 100) * progressPerChunk
            this.updateState({ progress: Math.floor(baseProgress + withinChunkProgress) })
          }
        )

        const sizeMB = (zipBlob.size / (1024 * 1024)).toFixed(2)
        console.log(`✅ ZIP ${chunkIndex + 1}/${numChunks} created | Size: ${sizeMB}MB`)

        // Download this chunk
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url

        if (numChunks > 1) {
          a.download = `pointcloud-${this.settings.format}-part${chunkIndex + 1}of${numChunks}-frames${startFrame}-${endFrame - 1}-${duration}s-${timestamp}.zip`
        } else {
          a.download = `pointcloud-${this.settings.format}-${totalFrames}frames-${duration}s-${timestamp}.zip`
        }

        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        console.log(`💾 Downloaded: ${a.download}`)

        // Clear this chunk's blobs from memory
        for (let i = startFrame; i < endFrame; i++) {
          this.encodedBlobs[i] = null
        }
      }

      this.updateState({ progress: 100 })

      console.log(`\n=== RECORDING COMPLETE ===`)
      console.log(`Format: ${this.settings.format.toUpperCase()} | Frames: ${totalFrames} | Duration: ${duration}s | FPS: ${this.settings.fps} | Size: ${totalSizeMB.toFixed(0)}MB | Files: ${numChunks}`)
    } catch (err) {
      console.error('Failed to create ZIP:', err)
    } finally {
      // Stop status logging
      if (this.statusLogInterval) {
        clearInterval(this.statusLogInterval)
        this.statusLogInterval = null
      }

      // Cleanup
      this.pendingFrames = []
      this.encodedBlobs = []
      this.framesInFlight = 0
      this.frameCount = 0
      this.updateState({ isProcessing: false, progress: 0, phase: null })
    }
  }

  updateSettings(settings: PngRecorderSettings): void {
    this.settings = settings
  }

  cleanup(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.statusLogInterval) {
      clearInterval(this.statusLogInterval)
      this.statusLogInterval = null
    }

    // Cleanup workers
    this.workerPool.forEach(worker => {
      worker.postMessage({ type: 'terminate' })
      worker.terminate()
    })
    this.workerPool = []
    this.workerReadyCount = 0

    this.canvasRef = null
    this.pendingFrames = []
    this.encodedBlobs = []

    // Reset state
    this.isProcessing = false
    this.progress = 0
    this.phase = null
  }
}
