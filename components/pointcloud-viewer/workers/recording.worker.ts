/**
 * Web Worker for encoding captured frames.
 * Receives frames from main thread and encodes them to PNG/JPEG blobs.
 */

interface EncodeFrameMessage {
  type: 'encode_frame'
  frameIndex: number
  imageBitmap: ImageBitmap
  mimeType: string
  quality: number
  totalFrames: number
}

interface TerminateMessage {
  type: 'terminate'
}

type WorkerMessage = EncodeFrameMessage | TerminateMessage

self.addEventListener('message', async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data

  if (message.type === 'terminate') {
    self.close()
    return
  }

  if (message.type === 'encode_frame') {
    const { frameIndex, imageBitmap, mimeType, quality, totalFrames } = message

    try {
      // Create OffscreenCanvas from ImageBitmap
      const offscreenCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
      const ctx = offscreenCanvas.getContext('2d')

      if (!ctx) {
        self.postMessage({ type: 'error', frameIndex, error: 'Failed to get 2d context' })
        return
      }

      // Draw the ImageBitmap to the OffscreenCanvas
      ctx.drawImage(imageBitmap, 0, 0)

      // Convert to Blob (expensive operation offloaded to worker thread)
      const blob = await offscreenCanvas.convertToBlob({
        type: mimeType,
        quality: quality
      })

      // Send encoded blob with progress info
      self.postMessage({
        type: 'encoded',
        frameIndex,
        blob,
        current: frameIndex + 1,
        total: totalFrames
      })

      // Clean up
      imageBitmap.close()
    } catch (error) {
      self.postMessage({
        type: 'error',
        frameIndex,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
})

// Signal that worker is ready
self.postMessage({ type: 'ready' })
