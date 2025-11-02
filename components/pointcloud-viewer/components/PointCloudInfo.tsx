export interface PointCloudInfoProps {
  topic: string
  pointCount: number
}

/**
 * Displays topic name and point count information
 */
export function PointCloudInfo({ topic, pointCount }: PointCloudInfoProps) {
  return (
    <div className="absolute left-4 z-10" style={{ top: 'calc(3rem + env(safe-area-inset-top) + 0.5rem)' }}>
      <div className="px-3 py-2 bg-background/90 backdrop-blur-sm rounded-md border">
        <div className="text-xs text-muted-foreground">{topic}</div>
        <div className="text-xs text-muted-foreground/70 mt-0.5">
          {pointCount.toLocaleString()} points
        </div>
      </div>
    </div>
  )
}
