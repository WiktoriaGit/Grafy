import { useMemo } from 'react'
import {
  EdgeLabelRenderer,
  useStore,
  useViewport,
  type ReactFlowState,
} from '@xyflow/react'
import type { GraphCallout } from './graphCallouts'
import './GraphCalloutsOverlay.css'

type Props = {
  /** Active callouts for the CURRENT step only (do not accumulate history). */
  callouts: GraphCallout[]
  enabled?: boolean
}

const KIND_LABEL: Record<GraphCallout['kind'], string> = {
  analyze: 'Analiza',
  update: 'Aktualizacja',
  skip: 'Pominięcie',
  done: 'Wynik',
  info: 'Info',
}

type Point = { x: number; y: number }

function nodeCenterSelector(id: string) {
  return (state: ReactFlowState) => {
    const node = state.nodeLookup.get(id)
    if (!node) return null
    const width = node.measured?.width ?? (typeof node.width === 'number' ? node.width : 56)
    const height = node.measured?.height ?? (typeof node.height === 'number' ? node.height : 56)
    const abs = node.internals?.positionAbsolute ?? node.position
    return {
      x: abs.x + width / 2,
      y: abs.y + height / 2,
    }
  }
}

function canvasAnchorSelector(state: ReactFlowState): Point {
  const nodes = [...state.nodeLookup.values()]
  if (!nodes.length) return { x: 200, y: 80 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const width = node.measured?.width ?? (typeof node.width === 'number' ? node.width : 56)
    const height = node.measured?.height ?? (typeof node.height === 'number' ? node.height : 56)
    const abs = node.internals?.positionAbsolute ?? node.position
    minX = Math.min(minX, abs.x)
    minY = Math.min(minY, abs.y)
    maxX = Math.max(maxX, abs.x + width)
    maxY = Math.max(maxY, abs.y + height)
  }
  return {
    x: (minX + maxX) / 2,
    y: minY - 8,
  }
}

function CalloutBubble({
  callout,
  x,
  y,
  placeBelow,
}: {
  callout: GraphCallout
  x: number
  y: number
  placeBelow: boolean
}) {
  const translate = placeBelow
    ? `translate(-50%, 16%) translate(${x}px, ${y}px)`
    : `translate(-50%, -112%) translate(${x}px, ${y}px)`

  return (
    <div
      className={`graph-callout graph-callout-${callout.kind}`}
      style={{
        position: 'absolute',
        transform: translate,
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      <span className="graph-callout-badge">{KIND_LABEL[callout.kind]}</span>
      <strong>{callout.headline}</strong>
      <p>{callout.body}</p>
    </div>
  )
}

function ActiveCallout({ callout }: { callout: GraphCallout }) {
  const point = useStore((state: ReactFlowState) => {
    if (callout.anchor.type === 'canvas') return canvasAnchorSelector(state)
    if (callout.anchor.type === 'node') return nodeCenterSelector(callout.anchor.id)(state)
    const source = nodeCenterSelector(callout.anchor.source)(state)
    const target = nodeCenterSelector(callout.anchor.target)(state)
    if (!source || !target) return null
    return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  })

  if (!point) return null
  const placeBelow = callout.anchor.type === 'canvas' ? false : point.y < 64
  return (
    <CalloutBubble
      callout={callout}
      x={point.x}
      y={point.y}
      placeBelow={placeBelow}
    />
  )
}

/**
 * Renders only the active callout(s) for the current step.
 * Keyed by callout.id so the previous bubble unmounts when the step changes.
 */
export default function GraphCalloutsOverlay({ callouts, enabled = true }: Props) {
  const { zoom } = useViewport()
  // Default: one primary callout. A second is allowed only if the producer sent two distinct ones.
  const active = useMemo(() => callouts.slice(0, 1), [callouts])
  const visible = enabled && zoom >= 0.45 && active.length > 0

  if (!visible) return null

  return (
    <EdgeLabelRenderer>
      {active.map(callout => (
        <ActiveCallout key={callout.id} callout={callout} />
      ))}
    </EdgeLabelRenderer>
  )
}
