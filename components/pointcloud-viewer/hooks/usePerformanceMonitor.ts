import { useEffect, useRef } from "react"
import Stats from "stats.js"

/**
 * Custom hook that adds an FPS counter to the page using Stats.js.
 * The counter is positioned in the top-left corner and automatically
 * cleaned up when the component unmounts.
 *
 * @param enabled - Whether to show the performance monitor (default: true)
 */
export function usePerformanceMonitor(enabled: boolean = true) {
  const statsRef = useRef<Stats | null>(null)

  useEffect(() => {
    if (!enabled) return

    const stats = new Stats()
    stats.showPanel(0) // 0: fps, 1: ms, 2: mb
    stats.dom.style.position = 'absolute'
    stats.dom.style.left = '16px'
    stats.dom.style.top = 'calc(3rem + env(safe-area-inset-top) + 0.5rem + 76px)'
    stats.dom.style.zIndex = '10'
    document.body.appendChild(stats.dom)
    statsRef.current = stats

    const animate = () => {
      stats.update()
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      if (stats.dom.parentNode) {
        document.body.removeChild(stats.dom)
      }
    }
  }, [enabled])
}
