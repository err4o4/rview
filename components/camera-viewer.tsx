"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { MessageType } from "@/lib/services/unifiedWebSocket"
import { useRosTopic } from "@/lib/hooks/useRosTopic"

interface CameraViewerProps {
  topic: string
}

export function CameraViewer({ topic }: CameraViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  const handleMessage = useCallback((message: any) => {
    try {
      // Revoke previous object URL to prevent memory leaks
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
      }

      if (!message) {
        setError("No message data")
        return
      }

      // Handle CompressedImage message (has format field)
      if (message.data && message.format) {
        const blob = new Blob([message.data], {
          type: `image/${message.format}`
        })
        const url = URL.createObjectURL(blob)
        prevUrlRef.current = url
        setImageUrl(url)
        setError(null)
      }
      // Handle uncompressed Image message (has encoding field)
      else if (message.data && message.encoding && message.width && message.height) {
        const canvas = document.createElement('canvas')
        canvas.width = message.width
        canvas.height = message.height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          setError("Failed to create canvas context")
          return
        }

        const imageData = ctx.createImageData(message.width, message.height)

        // Convert RGB8 to RGBA
        if (message.encoding === 'rgb8') {
          for (let i = 0; i < message.data.length / 3; i++) {
            imageData.data[i * 4] = message.data[i * 3]      // R
            imageData.data[i * 4 + 1] = message.data[i * 3 + 1]  // G
            imageData.data[i * 4 + 2] = message.data[i * 3 + 2]  // B
            imageData.data[i * 4 + 3] = 255                   // A
          }
        } else if (message.encoding === 'bgr8') {
          for (let i = 0; i < message.data.length / 3; i++) {
            imageData.data[i * 4] = message.data[i * 3 + 2]      // R
            imageData.data[i * 4 + 1] = message.data[i * 3 + 1]  // G
            imageData.data[i * 4 + 2] = message.data[i * 3]      // B
            imageData.data[i * 4 + 3] = 255                       // A
          }
        } else {
          setError(`Unsupported encoding: ${message.encoding}`)
          return
        }

        ctx.putImageData(imageData, 0, 0)

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            prevUrlRef.current = url
            setImageUrl(url)
            setError(null)
          }
        }, 'image/jpeg', 0.9)
      } else {
        console.warn("Unknown image format:", message)
        setError("Unknown image format")
      }
    } catch (err) {
      console.error("Error processing image:", err)
      setError("Error processing image")
    }
  }, [])

  useRosTopic<any>({
    topic,
    messageType: MessageType.COMPRESSED_IMAGE,
    enabled: !!topic,
    onMessage: handleMessage,
  })

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
      }
    }
  }, [])

  if (!topic) return null

  return (
    <div
      className="absolute left-4 bottom-4 z-10 bg-background/90 backdrop-blur-sm border rounded-md shadow-lg overflow-hidden"
      style={{
        width: '240px',
        maxWidth: '50vw',
        //marginBottom: 'calc(env(safe-area-inset-bottom))'
      }}
    >
      {error && (
        <div className="p-4 text-xs text-destructive text-center">
          {error}
        </div>
      )}
      {imageUrl && !error && (
        <img
          src={imageUrl}
          alt="Camera feed"
          className="w-full h-auto"
          style={{ display: 'block' }}
        />
      )}
      {!imageUrl && !error && (
        <div className="p-4 text-xs text-muted-foreground text-center">
          Waiting for image on {topic}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-background/60 px-2 py-1">
        <p className="text-xs text-muted-foreground truncate">{imageUrl && !error && (topic)}</p>
      </div>
    </div>
  )
}
