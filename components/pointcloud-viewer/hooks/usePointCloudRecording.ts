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
 * Custom hook for screen recording functionality using Web Worker batch encoding.
 *
 * Strategy:
 * 1. During recording: Capture frames as ImageBitmap (very fast, non-blocking)
 * 2. After stopping: Batch encode all frames in Web Worker (parallel, off main thread)
 * 3. Then create ZIP archive
 *
 * This approach captures 100% of frames without blocking the renderer.
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
  const recordingFramesRef = useRef<{ index: number; imageBitmap: ImageBitmap }[]>([])
  const encodedBlobsRef = useRef<(Blob | null)[]>([])
  const recordingAnimationFrameRef = useRef<number | null>(null)
  const frameCountRef = useRef<number>(0)
  const lastCaptureTimeRef = useRef<number>(0)
  const workerRef = useRef<Worker | null>(null)
  const workerReadyRef = useRef<boolean>(false)

  const captureIntervalMs = 1000 / settings.fps
  const captureQuality = settings.quality

  // Initialize Web Worker for batch encoding
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/recording.worker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e) => {
      const message = e.data

      if (message.type === 'ready') {
        workerReadyRef.current = true
        return
      }

      // Store encoded blobs as they come in
      if (message.type === 'encoded') {
        const { frameIndex, blob } = message
        encodedBlobsRef.current[frameIndex] = blob
      }

      if (message.type === 'error') {
        console.error('Worker encoding error:', message.error)
      }
    }

    workerRef.current = worker

    return () => {
      worker.postMessage({ type: 'terminate' })
      worker.terminate()
    }
  }, [])

  const startRecording = useCallback(() => {
    if (!canvasRef.current || !rendererRef.current) return

    try {
      // Reset storage
      recordingFramesRef.current = []
      encodedBlobsRef.current = []
      frameCountRef.current = 0
      lastCaptureTimeRef.current = performance.now()
      setRecordedFrameCount(0)
      setIsRecording(true)

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

            // Store raw ImageBitmap for later encoding
            recordingFramesRef.current.push({
              index: frameIndex,
              imageBitmap
            })

            setRecordedFrameCount(frameIndex + 1)
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
  }, [canvasRef, rendererRef, captureIntervalMs])

  const stopRecording = useCallback(async () => {
    if (recordingAnimationFrameRef.current === null || !workerRef.current) return

    // Stop capturing frames
    cancelAnimationFrame(recordingAnimationFrameRef.current)
    recordingAnimationFrameRef.current = null
    setIsRecording(false)

    const capturedFrames = recordingFramesRef.current
    const totalFrames = capturedFrames.length

    if (totalFrames === 0) {
      console.warn('No frames captured')
      return
    }

    // PHASE 1: Encode frames (0-60% progress)
    setIsPreparingZip(true)
    setZipProgress(0)
    setProcessingPhase('encoding')

    // Prepare array to collect encoded blobs
    encodedBlobsRef.current = new Array(totalFrames).fill(null)

    const mimeType = settings.format === 'jpeg' ? 'image/jpeg' : 'image/png'
    let encodedCount = 0

    // Encode frames in batches of 10 to maintain worker throughput and smooth progress
    await new Promise<void>((resolve) => {
      let frameToSendIndex = 0
      const BATCH_SIZE = 10
      let framesInFlight = 0

      const sendNextBatch = () => {
        // Send up to BATCH_SIZE frames
        while (frameToSendIndex < capturedFrames.length && framesInFlight < BATCH_SIZE) {
          const frame = capturedFrames[frameToSendIndex]
          frameToSendIndex++
          framesInFlight++

          workerRef.current?.postMessage(
            {
              type: 'encode_frame',
              frameIndex: frame.index,
              imageBitmap: frame.imageBitmap,
              mimeType,
              quality: captureQuality,
              totalFrames
            },
            [frame.imageBitmap] // Transfer ownership to avoid cloning
          )
        }
      }

      const handleWorkerMessage = (e: MessageEvent) => {
        const message = e.data

        if (message.type === 'encoded') {
          encodedCount++
          framesInFlight--

          // Update progress bar: 0-60% for encoding phase
          const { current, total } = message
          const encodingProgress = Math.round((current / total) * 60)
          setZipProgress(encodingProgress)

          // Send next batch to keep worker busy
          sendNextBatch()

          // Check if all frames are done
          if (encodedCount === totalFrames) {
            workerRef.current?.removeEventListener('message', handleWorkerMessage)
            resolve()
          }
        }
      }

      // Add listener for encoding progress
      workerRef.current?.addEventListener('message', handleWorkerMessage)

      // Start by sending the first batch
      sendNextBatch()
    })

    // Filter out null entries (in case any failed)
    const encodedFrames = encodedBlobsRef.current.filter((blob): blob is Blob => blob !== null)
    const successfulFrames = encodedFrames.length

    if (successfulFrames === 0) {
      console.warn('No frames successfully encoded')
      setIsPreparingZip(false)
      return
    }

    // PHASE 2: Add frames to ZIP (60-80% progress)
    setProcessingPhase('adding')

    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const fileExt = settings.format === 'jpeg' ? 'jpg' : 'png'

      // Add frames in chunks with periodic yields to event loop
      const chunkSize = 10
      for (let i = 0; i < encodedFrames.length; i += chunkSize) {
        const chunk = encodedFrames.slice(i, i + chunkSize)

        // Add chunk of frames (Blobs are added directly, much faster than base64)
        chunk.forEach((blob, chunkIndex) => {
          const frameNumber = String(i + chunkIndex).padStart(5, '0')
          zip.file(`frame_${frameNumber}.${fileExt}`, blob, { binary: true })
        })

        // Update progress: 60-80% for adding files to ZIP
        const addingProgress = 60 + Math.round(((i + chunkSize) / encodedFrames.length) * 20)
        setZipProgress(Math.min(addingProgress, 80))

        // Yield to event loop to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // PHASE 3: Generate ZIP (80-100% progress)
      setProcessingPhase('compressing')

      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'STORE' // No compression - files are already compressed
        },
        (metadata) => {
          // Update progress: 80-100% for ZIP generation
          const zipProgress = 80 + Math.round(metadata.percent / 5)
          setZipProgress(zipProgress)
        }
      )

      setZipProgress(100)

      // Download the zip
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      const filename = `pointcloud-recording-${Date.now()}-${successfulFrames}frames.zip`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Log ffmpeg commands for video encoding
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
      recordingFramesRef.current = []
      encodedBlobsRef.current = []
      frameCountRef.current = 0
    }
  }, [settings.format, settings.fps, captureQuality])

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
