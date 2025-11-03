/**
 * Web Worker for creating blobs from video segments in the background.
 * The actual download happens on the main thread since workers don't have DOM access.
 */

export interface BlobRequest {
  type: 'createBlob'
  buffer: ArrayBuffer
  filename: string
}

export interface BlobResponse {
  type: 'blobReady'
  blob: Blob
  filename: string
  sizeMB: number
}

export interface ErrorResponse {
  type: 'error'
  error: string
}

self.onmessage = (e: MessageEvent<BlobRequest>) => {
  const { buffer, filename } = e.data

  try {
    // Create blob from buffer (this is the heavy operation we offload to worker)
    const blob = new Blob([buffer], { type: 'video/mp4' })
    const sizeMB = blob.size / (1024 * 1024)

    // Send blob back to main thread for download
    const response: BlobResponse = {
      type: 'blobReady',
      blob,
      filename,
      sizeMB
    }

    self.postMessage(response)
  } catch (err) {
    const errorResponse: ErrorResponse = {
      type: 'error',
      error: String(err)
    }
    self.postMessage(errorResponse)
  }
}
