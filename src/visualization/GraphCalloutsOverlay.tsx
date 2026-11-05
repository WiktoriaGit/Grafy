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

function anchorPoint(
  callout: GraphCallout,
  centers: Map<string, Point | null>,
): Point | null {
  if (callout.anchor.type === 'node') {
    return centers.get(callout.anchor.id) ?? null
  }
  const source = centers.get(callout.anchor.source)
  const target = centers.get(callout.anchor.target)
  if (!source || !target) return null
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
}

/** Nudge a second bubble so it does not sit on top of the first. */
function separatePoints(a: Point, b: Point): [Point, Point] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const minGap = 130
  if (dist >= minGap) return [a, b]

  // Prefer vertical stack when anchors are close / identical.
  if (dist < 8) {
    return [
      { x: a.x - 20, y: a.y - 18 },
      { x: b.x + 20, y: b.y + 72 },
    ]
  }

  const scale = (minGap - dist) / (2 * dist)
  return [
    { x: a.x - dx * scale, y: a.y - dy * scale },
    { x: b.x + dx * scale, y: b.y + dy * scale },
  ]
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
    ? `translate(-50%, 14%) translate(${x}px, ${y}px)`
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

function CalloutsLaidOut({ callouts }: { callouts: GraphCallout[] }) {
  const nodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of callouts) {
      if (c.anchor.type === 'node') ids.add(c.anchor.id)
      else {
        ids.add(c.anchor.source)
        ids.add(c.anchor.target)
      }
    }
    return [...ids]
  }, [callouts])

  const centers = useStore(state => {
    const map = new Map<string, Point | null>()
    for (const id of nodeIds) map.set(id, nodeCenterSelector(id)(state))
    return map
  })

  const laidOut = useMemo(() => {
    const withPoints = callouts
      .map(callout => ({ callout, point: anchorPoint(callout, centers) }))
      .filter((item): item is { callout: GraphCallout; point: Point } => item.point != null)

    if (withPoints.length <= 1) {
      return withPoints.map((item, index) => ({
        ...item,
        placeBelow: item.point.y < 70 || index === 1,
      }))
    }

    const [p0, p1] = separatePoints(withPoints[0].point, withPoints[1].point)
    return [
      { callout: withPoints[0].callout, point: p0, placeBelow: p0.y < 70 },
      { callout: withPoints[1].callout, point: p1, placeBelow: true },
    ]
  }, [callouts, centers])

  return (
    <>
      {laidOut.map(({ callout, point, placeBelow }) => (
        <CalloutBubble
          key={callout.id}
          callout={callout}
          x={point.x}
          y={point.y}
          placeBelow={placeBelow}
        />
      ))}
    </>
  )
}

/**
 * Educational callouts anchored to nodes/edges inside React Flow.
 * Deduped upstream; here we only separate close positions.
 */
export default function GraphCalloutsOverlay({ callouts, enabled = true }: Props) {
  const { zoom } = useViewport()
  const visible = enabled && zoom >= 0.45
  const limited = useMemo(() => callouts.slice(0, 2), [callouts])

  if (!visible || limited.length === 0) return null

  return (
    <EdgeLabelRenderer>
      <CalloutsLaidOut callouts={limited} />
    </EdgeLabelRenderer>
  )
}
