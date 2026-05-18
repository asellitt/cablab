import { useCallback, useRef } from 'react'
import type React from 'react'

export function useTouchGestures(
  onSingleTap: () => void,
  onDoubleTap: () => void,
  onLongPress: () => void,
) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapTime    = useRef<number>(0)
  const didLongPress   = useRef(false)

  const onTouchStart = useCallback((_e: React.TouchEvent) => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      didLongPress.current = true
      onLongPress()
    }, 500)
  }, [onLongPress])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (didLongPress.current) return

    const now = Date.now()
    if (now - lastTapTime.current < 300) {
      e.preventDefault()
      lastTapTime.current = 0
      onDoubleTap()
    } else {
      lastTapTime.current = now
      // Delay single tap so a double tap can cancel it
      setTimeout(() => {
        if (lastTapTime.current !== 0) {
          lastTapTime.current = 0
          onSingleTap()
        }
      }, 300)
    }
  }, [onSingleTap, onDoubleTap])

  const onTouchMove = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  return { onTouchStart, onTouchEnd, onTouchMove }
}
