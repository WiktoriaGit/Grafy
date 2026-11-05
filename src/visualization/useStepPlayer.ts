import { useCallback, useEffect, useMemo, useState } from 'react'

export const SPEED_OPTIONS = [
  { value: 1400, label: 'Bardzo wolno' },
  { value: 900, label: 'Wolno' },
  { value: 550, label: 'Normalnie' },
  { value: 280, label: 'Szybko' },
  { value: 120, label: 'Bardzo szybko' },
] as const

export type StepPlayer = {
  index: number
  playing: boolean
  speed: number
  stepCount: number
  isFirst: boolean
  isLast: boolean
  canPlay: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  first: () => void
  last: () => void
  next: () => void
  prev: () => void
  seek: (value: number) => void
  setSpeed: (value: number) => void
  bind: (count: number) => void
}

export function useStepPlayer(initialCount = 0): StepPlayer {
  const [stepCount, setStepCount] = useState(initialCount)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(550)

  const bind = useCallback((count: number) => {
    setStepCount(count)
    setIndex(0)
    setPlaying(false)
  }, [])

  const isFirst = index <= 0
  const isLast = stepCount === 0 || index >= stepCount - 1
  const canPlay = stepCount > 1

  const play = useCallback(() => {
    if (stepCount <= 1) return
    setPlaying(true)
  }, [stepCount])

  const pause = useCallback(() => setPlaying(false), [])

  const toggle = useCallback(() => {
    if (stepCount <= 1) return
    setPlaying(current => {
      if (!current && index >= stepCount - 1) {
        setIndex(0)
        return true
      }
      return !current
    })
  }, [index, stepCount])

  const reset = useCallback(() => {
    setIndex(0)
    setPlaying(false)
  }, [])

  const first = useCallback(() => {
    setIndex(0)
    setPlaying(false)
  }, [])

  const last = useCallback(() => {
    setIndex(Math.max(stepCount - 1, 0))
    setPlaying(false)
  }, [stepCount])

  const next = useCallback(() => {
    setPlaying(false)
    setIndex(i => Math.min(i + 1, Math.max(stepCount - 1, 0)))
  }, [stepCount])

  const prev = useCallback(() => {
    setPlaying(false)
    setIndex(i => Math.max(i - 1, 0))
  }, [])

  const seek = useCallback((value: number) => {
    if (stepCount <= 0) return
    const nextIndex = Math.max(0, Math.min(stepCount - 1, Math.round(value)))
    setIndex(nextIndex)
    setPlaying(false)
  }, [stepCount])

  useEffect(() => {
    if (!playing || stepCount <= 1 || index >= stepCount - 1) {
      if (playing && index >= stepCount - 1) setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setIndex(i => Math.min(i + 1, stepCount - 1))
    }, speed)
    return () => window.clearTimeout(timer)
  }, [playing, index, stepCount, speed])

  return useMemo(
    () => ({
      index,
      playing,
      speed,
      stepCount,
      isFirst,
      isLast,
      canPlay,
      play,
      pause,
      toggle,
      reset,
      first,
      last,
      next,
      prev,
      seek,
      setSpeed,
      bind,
    }),
    [index, playing, speed, stepCount, isFirst, isLast, canPlay, play, pause, toggle, reset, first, last, next, prev, seek, bind],
  )
}
