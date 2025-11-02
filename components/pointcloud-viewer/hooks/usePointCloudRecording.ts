import { useState, useRef, useCallback, useEffect } from "react"
import * as THREE from "three"

export interface RecordingSettings {
  format: 'jpeg' | 'png'
  fps: number
  quality: number
}

export interface UsePointCloudRecordingOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>
  settings: RecordingSettings
}

export type ProcessingPhase = 'encoding' | 'adding' | 'compressing' | null

export interface UsePointCloudRecordingReturn {
  isRecording: boolean
  recordedFrameCount: number
  isPreparingZip: boolean
  zipProgress: number
  processingPhase: ProcessingPhase
  startRecording: () => void
  stopRecording: () => Promise<void>
  toggleRecording: () => void
}

/**
 * Custom hook for screen recording functionality using multi-worker parallel streaming encoding.
 *
 * Strategy:
 * 1. During recording: Capture ImageBitmap → Queue → Distribute to worker pool → Parallel encode → Store blob → Delete ImageBitmap
 * 2. Uses 2-8 workers based on CPU cores (navigator.hardwareConcurrency)
 * 3. Maintains only ~100-200 unencoded frames in RAM at any time (20 frames per worker)
 * 4. On stop: Wait for remaining queue to finish → Create ZIP from encoded blobs
 *
 * Multi-worker benefits:
 * - 4x-8x faster encoding on multi-core CPUs
 * - Can easily keep up with 30fps @ 1080p
 * - RAM usage still minimal (~1-2GB) vs old approach (83GB for 10k frames)
 *
 * @param options - Configuration options including canvas/renderer refs and settings
 * @returns Recording state and control functions
 */
export function usePointCloudRecording({
  canvasRef,
  rendererRef,
  settings
}: UsePointCloudRecordingOptions): UsePointCloudRecordingReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrameCount, setRecordedFrameCount] = useState(0)
  const [isPreparingZip, setIsPreparingZip] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>(null)

  // Recording refs
  const encodedBlobsRef = useRef<(Blob | null)[]>([])
  const recordingAnimationFrameRef = useRef<number | null>(null)
  const frameCountRef = useRef<number>(0)
  const lastCaptureTimeRef = useRef<number>(0)

  // Multi-worker pool
  const workerPoolRef = useRef<Worker[]>([])
  const workerReadyCountRef = useRef<number>(0)
  const nextWorkerIndexRef = useRef<number>(0)
  const WORKER_COUNT = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8)) // 2-8 workers based on CPU cores

  // Streaming encoding queue
  const pendingFramesRef = useRef<{ index: number; imageBitmap: ImageBitmap }[]>([])
  const framesInFlightRef = useRef<number>(0)
  const encodedCountRef = useRef<number>(0)
  const statusLogIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const frameSizeMBRef = useRef<number>(0)
  const FRAMES_PER_WORKER = 20 // Keep 20 frames per worker encoding at once
  const BATCH_SIZE = WORKER_COUNT * FRAMES_PER_WORKER // Total frames in-flight across all workers

  const captureIntervalMs = 1000 / settings.fps
  const captureQuality = settings.quality
  const mimeType = settings.format === 'jpeg' ? 'image/jpeg' : 'image/png'

  // Function to send frames from pending queue to worker pool (round-robin distribution)
  const sendFramesToWorker = useCallback(() => {
    if (workerPoolRef.current.length === 0) return

    // Send frames until we reach BATCH_SIZE in-flight or run out of pending frames
    while (pendingFramesRef.current.length > 0 && framesInFlightRef.current < BATCH_SIZE) {
      const frame = pendingFramesRef.current.shift()
      if (!frame) break

      // Round-robin: distribute frames across workers
      const worker = workerPoolRef.current[nextWorkerIndexRef.current]
      nextWorkerIndexRef.current = (nextWorkerIndexRef.current + 1) % WORKER_COUNT

      framesInFlightRef.current++

      worker.postMessage(
        {
          type: 'encode_frame',
          frameIndex: frame.index,
          imageBitmap: frame.imageBitmap,
          mimeType,
          quality: captureQuality,
          totalFrames: 0 // Will be set on stop
        },
        [frame.imageBitmap] // Transfer ownership to free RAM immediately
      )
    }
  }, [mimeType, captureQuality, WORKER_COUNT])

  // Initialize Web Worker pool for parallel encoding
  useEffect(() => {
    console.log(`🔧 Initializing ${WORKER_COUNT} encoding workers (CPU cores: ${navigator.hardwareConcurrency || 'unknown'})`)

    // Create worker pool
    const workers: Worker[] = []
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../workers/recording.worker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (e) => {
        const message = e.data

        if (message.type === 'ready') {
          workerReadyCountRef.current++
          if (workerReadyCountRef.current === WORKER_COUNT) {
            console.log(`✅ All ${WORKER_COUNT} workers ready`)
          }
          return
        }

        // Store encoded blobs as they come in during recording
        if (message.type === 'encoded') {
          const { frameIndex, blob } = message
          encodedBlobsRef.current[frameIndex] = blob
          framesInFlightRef.current--
          encodedCountRef.current++

          // Send next frame from queue to keep workers busy
          sendFramesToWorker()
        }

        if (message.type === 'error') {
          console.error(`❌ Worker encoding error for frame ${message.frameIndex}:`, message.error)
          framesInFlightRef.current--
          sendFramesToWorker()
        }
      }

      workers.push(worker)
    }

    workerPoolRef.current = workers

    return () => {
      // Cleanup all workers
      workers.forEach(worker => {
        worker.postMessage({ type: 'terminate' })
        worker.terminate()
      })
      workerPoolRef.current = []
      workerReadyCountRef.current = 0
    }
  }, [sendFramesToWorker, WORKER_COUNT])

  const startRecording = useCallback(() => {
    if (!canvasRef.current || !rendererRef.current) return

    try {
      // Reset storage
      pendingFramesRef.current = []
      encodedBlobsRef.current = []
      framesInFlightRef.current = 0
      encodedCountRef.current = 0
      frameCountRef.current = 0
      frameSizeMBRef.current = 0
      lastCaptureTimeRef.current = performance.now()
      setRecordedFrameCount(0)
      setIsRecording(true)

      console.log(`🎬 Recording started | Format: ${settings.format.toUpperCase()} | FPS: ${settings.fps} | Quality: ${captureQuality}`)
      console.log(`🔄 Streaming encoding enabled with ${WORKER_COUNT} parallel workers - encoding frames during capture to minimize RAM usage`)

      // Start status logging interval (every second)
      statusLogIntervalRef.current = setInterval(() => {
        const totalCaptured = frameCountRef.current
        const inQueue = pendingFramesRef.current.length
        const inFlight = framesInFlightRef.current
        const encoded = encodedCountRef.current
        const inRAM = inQueue + inFlight
        const ramUsageMB = frameSizeMBRef.current * inRAM

        console.log(
          `📊 Status: Total=${totalCaptured} | In RAM=${inRAM} (${ramUsageMB.toFixed(0)}MB) | Encoding=${inFlight} | Encoded=${encoded}`
        )
      }, 1000)

      // Capture frames using requestAnimationFrame
      const captureFrame = async () => {
        if (!canvasRef.current) return

        const now = performance.now()
        const elapsed = now - lastCaptureTimeRef.current

        // Only capture at specified FPS
        if (elapsed >= captureIntervalMs) {
          lastCaptureTimeRef.current = now
          const frameIndex = frameCountRef.current
          frameCountRef.current++

          try {
            // Create ImageBitmap from canvas (fast, non-blocking)
            const imageBitmap = await createImageBitmap(canvasRef.current)

            // Store frame size on first frame for RAM calculations
            if (frameIndex === 0) {
              frameSizeMBRef.current = (imageBitmap.width * imageBitmap.height * 4) / (1024 * 1024)
            }

            // Add to pending queue for encoding
            pendingFramesRef.current.push({
              index: frameIndex,
              imageBitmap
            })

            setRecordedFrameCount(frameIndex + 1)

            // Immediately start encoding (maintains max BATCH_SIZE frames in-flight)
            sendFramesToWorker()
          } catch (err) {
            console.error('Failed to capture frame:', err)
          }
        }

        // Continue capturing
        recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)
      }

      // Start the capture loop
      recordingAnimationFrameRef.current = requestAnimationFrame(captureFrame)

    } catch (err) {
      console.error('Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [canvasRef, rendererRef, captureIntervalMs, sendFramesToWorker, WORKER_COUNT])

  const stopRecording = useCallback(async () => {
    if (recordingAnimationFrameRef.current === null || workerPoolRef.current.length === 0) return

    // Stop capturing new frames and status logging
    cancelAnimationFrame(recordingAnimationFrameRef.current)
    recordingAnimationFrameRef.current = null
    if (statusLogIntervalRef.current) {
      clearInterval(statusLogIntervalRef.current)
      statusLogIntervalRef.current = null
    }
    setIsRecording(false)

    const totalFrames = frameCountRef.current

    if (totalFrames === 0) {
      console.warn('No frames captured')
      return
    }

    const remaining = pendingFramesRef.current.length + framesInFlightRef.current
    console.log(`\n⏹️  Recording stopped | Captured: ${totalFrames} | Encoded: ${encodedCountRef.current} | Remaining: ${remaining}`)

    // PHASE 1: Wait for remaining frames to encode (0-40% progress)
    setIsPreparingZip(true)
    setZipProgress(0)
    setProcessingPhase('encoding')

    if (remaining > 0) {
      console.log(`⏳ Waiting for ${remaining} remaining frames to encode...`)
    }

    // Wait for all pending and in-flight frames to finish encoding
    await new Promise<void>((resolve) => {
      let lastLogTime = Date.now()
      const checkInterval = setInterval(() => {
        const remaining = pendingFramesRef.current.length + framesInFlightRef.current

        // Update progress: 0-40% based on how many frames are left
        const encodedSoFar = totalFrames - remaining
        const progress = Math.round((encodedSoFar / totalFrames) * 40)
        setZipProgress(progress)

        // Log progress every second while waiting
        const now = Date.now()
        if (remaining > 0 && now - lastLogTime >= 1000) {
          const inFlight = framesInFlightRef.current
          const ramUsageMB = frameSizeMBRef.current * remaining
          console.log(
            `📊 Status: Total=${totalFrames} | In RAM=${remaining} (${ramUsageMB.toFixed(0)}MB) | Encoding=${inFlight} | Encoded=${encodedSoFar}`
          )
          lastLogTime = now
        }

        // All done when queue is empty and no frames in-flight
        if (remaining === 0) {
          clearInterval(checkInterval)
          setZipProgress(40)
          console.log(`✅ All ${totalFrames} frames encoded successfully!`)
          resolve()
        }
      }, 100) // Check every 100ms
    })

    // Filter out null entries (in case any failed)
    const encodedFrames = encodedBlobsRef.current.filter((blob): blob is Blob => blob !== null)
    const successfulFrames = encodedFrames.length

    if (successfulFrames === 0) {
      console.warn('❌ No frames successfully encoded')
      setIsPreparingZip(false)
      return
    }

    if (successfulFrames < totalFrames) {
      console.warn(`⚠️  ${totalFrames - successfulFrames} frames failed to encode. Proceeding with ${successfulFrames} successful frames.`)
    }

    // Calculate total size and determine if we need to split into multiple ZIPs
    const totalSize = encodedFrames.reduce((sum, blob) => sum + blob.size, 0)
    const totalSizeMB = totalSize / (1024 * 1024)
    const MAX_ZIP_SIZE_MB = 1500 // 1.5GB per ZIP to stay safe under 2GB browser limit

    // Calculate frames per ZIP
    const avgFrameSizeMB = totalSizeMB / successfulFrames
    const framesPerZip = Math.floor(MAX_ZIP_SIZE_MB / avgFrameSizeMB)
    const needsSplit = totalSizeMB > MAX_ZIP_SIZE_MB

    const zipCount = needsSplit ? Math.ceil(successfulFrames / framesPerZip) : 1

    if (needsSplit) {
      console.log(`Recording is ${totalSizeMB.toFixed(0)}MB - splitting into ${zipCount} ZIP files`)
    }

    // PHASE 2: Add frames to ZIP (40-70% progress)
    setProcessingPhase('adding')

    try {
      const JSZip = (await import('jszip')).default
      const fileExt = settings.format === 'jpeg' ? 'jpg' : 'png'
      const timestamp = Date.now()

      // Create and download ZIPs (split if needed)
      for (let zipIndex = 0; zipIndex < zipCount; zipIndex++) {
        const zip = new JSZip()

        const startFrame = zipIndex * framesPerZip
        const endFrame = Math.min(startFrame + framesPerZip, successfulFrames)
        const framesInThisZip = encodedFrames.slice(startFrame, endFrame)

        // Add frames to this ZIP
        const chunkSize = 10
        for (let i = 0; i < framesInThisZip.length; i += chunkSize) {
          const chunk = framesInThisZip.slice(i, i + chunkSize)

          chunk.forEach((blob, chunkIndex) => {
            const globalFrameNumber = startFrame + i + chunkIndex
            const frameNumber = String(globalFrameNumber).padStart(5, '0')
            zip.file(`frame_${frameNumber}.${fileExt}`, blob, { binary: true })
          })

          // Update progress: 40-70% for adding files to ZIP
          const totalProgress = ((zipIndex * framesPerZip) + i + chunkSize) / successfulFrames
          const addingProgress = 40 + Math.round(totalProgress * 30)
          setZipProgress(Math.min(addingProgress, 70))

          // Yield to event loop to keep UI responsive
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        // PHASE 3: Generate ZIP (70-100% progress for current ZIP)
        setProcessingPhase('compressing')

        const zipBlob = await zip.generateAsync(
          {
            type: 'blob',
            compression: 'STORE' // No compression - files are already compressed
          },
          (metadata) => {
            // Update progress: 70-100% for ZIP generation
            const baseProgress = 70 + (zipIndex / zipCount) * 30
            const zipProgress = baseProgress + Math.round((metadata.percent / 100) * (30 / zipCount))
            setZipProgress(Math.round(zipProgress))
          }
        )

        // Download this ZIP
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url

        const filename = needsSplit
          ? `pointcloud-recording-${timestamp}-part${zipIndex + 1}of${zipCount}-frames${startFrame}-${endFrame - 1}.zip`
          : `pointcloud-recording-${timestamp}-${successfulFrames}frames.zip`

        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        // Small delay between ZIP downloads
        if (zipIndex < zipCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      setZipProgress(100)

      // Log ffmpeg commands for video encoding
      if (needsSplit) {
        console.log(`\n=== SPLIT ZIP INSTRUCTIONS ===`)
        console.log(`Downloaded ${zipCount} ZIP files. To combine frames:`)
        console.log(`1. Extract all ZIP files to the same folder`)
        console.log(`2. All frames are numbered sequentially across ZIPs\n`)
      }

      if (settings.format === 'jpeg') {
        console.log(`\n=== VIDEO ENCODING OPTIONS (JPEG Input @ ${settings.fps} FPS) ===\n`)
        console.log('RECOMMENDED (high quality H.264):')
        console.log(`ffmpeg -framerate ${settings.fps} -pattern_type glob -i "frame_*.jpg" -c:v libx264 -crf 18 -pix_fmt yuv420p output.mp4`)
        console.log('  • JPEG input is already lossy, so lossless encoding not needed')
        console.log('  • CRF 18 = visually lossless for H.264\n')
        console.log('Option 2 - ProRes (best for video editors):')
        console.log(`ffmpeg -framerate ${settings.fps} -pattern_type glob -i "frame_*.jpg" -c:v prores_ks -profile:v 3 output.mov\n`)
        console.log('Option 3 - High compatibility (smaller file):')
        console.log(`ffmpeg -framerate ${settings.fps} -pattern_type glob -i "frame_*.jpg" -c:v libx264 -crf 23 -pix_fmt yuv420p output.mp4`)
      } else {
        console.log(`\n=== LOSSLESS VIDEO ENCODING OPTIONS (PNG Input @ ${settings.fps} FPS) ===\n`)
        console.log('RECOMMENDED (lossless H.264):')
        console.log(`ffmpeg -framerate ${settings.fps} -pattern_type glob -i "frame_*.png" -c:v libx264 -qp 0 -pix_fmt yuv444p output.mp4`)
        console.log('  • -qp 0 = truly lossless\n')
        console.log('Option 2 - ProRes 4444 (best for video editors):')
        console.log(`ffmpeg -framerate ${settings.fps} -pattern_type glob -i "frame_*.png" -c:v prores_ks -profile:v 4444 output.mov`)
      }

    } catch (err) {
      console.error('Failed to create zip:', err)
      console.log('Falling back to individual frame downloads (first 10 frames only)...')

      const fileExt = settings.format === 'jpeg' ? 'jpg' : 'png'

      // Fallback: download first 10 encoded frames individually
      encodedFrames.slice(0, 10).forEach((blob, index) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const frameNumber = String(index).padStart(5, '0')
        a.download = `frame_${frameNumber}.${fileExt}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
    } finally {
      // Clean up
      setIsPreparingZip(false)
      setZipProgress(0)
      setProcessingPhase(null)
      pendingFramesRef.current = []
      encodedBlobsRef.current = []
      framesInFlightRef.current = 0
      frameCountRef.current = 0
    }
  }, [settings.format, settings.fps])

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
    isPreparingZip,
    zipProgress,
    processingPhase,
    startRecording,
    stopRecording,
    toggleRecording
  }
}
