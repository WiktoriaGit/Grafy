import { MarkerType, type Edge, type Node } from '@xyflow/react'
import {
  distanceFromMap,
  pathFromParents,
  type Algorithm,
  type Step,
} from '../algorithms/graphAlgorithms'
import type { MSTStep } from '../algorithms/mstAlgorithms'
import type { SideResult } from './compareCore'

export type SavedGraph = {
  nodes: Array<{ id: string; position?: { x: number; y: number } }>
  edges: Array<{ source: string; target: string; weight?: number; label?: string }>
  directed: boolean
}

function edgeMatches(activeEdge: string | undefined, source: string, target: string, directed: boolean) {
  if (!activeEdge) return false
  if (activeEdge === `${source}|${target}`) return true
  return !directed && activeEdge === `${target}|${source}`
}

function pathUsesEdge(path: string[], source: string, target: string, directed: boolean) {
  return path.some((vertex, index) => {
    if (index === 0) return false
    const prev = path[index - 1]
    return (prev === source && vertex === target) || (!directed && prev === target && vertex === source)
  })
}

export function displayPathForSide(side: SideResult | null, end: string): string[] {
  if (!side || side.kind !== 'path') return []
  const { run, algorithm } = side
  if (algorithm === 'bellman') return run.path
  return pathFromParents(run.start, end, run.parents)
}

export function displayDistanceForSide(side: SideResult | null, end: string, path: string[]): number | null {
  if (!side || side.kind !== 'path') return null
  const { run, algorithm } = side
  if (algorithm === 'dijkstra' || algorithm === 'bellman') return distanceFromMap(end, run.distances)
  return path.length ? path.length - 1 : null
}

export function buildPathFlow(
  document: SavedGraph,
  step: Step | null | undefined,
  path: string[],
  showPath: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = document.nodes.map((node, index) => {
    const active = step?.current === node.id
    const visited = step?.visited.includes(node.id) ?? false
    const inFrontier = step?.frontier.includes(node.id) ?? false
    const onPath = showPath && path.includes(node.id)
    const background = onPath
      ? '#059669'
      : active
        ? '#A78BFA'
        : visited
          ? '#2A2440'
          : inFrontier
            ? '#1d4ed8'
            : '#1C1C24'
    const border = onPath
      ? '#6ee7b7'
      : active
        ? '#C4B5FD'
        : visited
          ? '#A78BFA'
          : inFrontier
            ? '#93c5fd'
            : '#33333F'

    return {
      id: node.id,
      position: node.position ?? { x: 120 + index * 100, y: 140 },
      data: { label: node.id },
      style: {
        width: 52,
        height: 52,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        color: '#F4F4F5',
        background,
        border: `2px solid ${border}`,
        boxShadow: active ? '0 0 0 2px rgba(167,139,250,0.35)' : inFrontier ? '0 0 0 2px rgba(96,165,250,0.3)' : 'none',
      },
    }
  })

  const edges: Edge[] = document.edges.map((edge, index) => {
    const highlighted = edgeMatches(step?.activeEdge, edge.source, edge.target, document.directed)
    const onPath = showPath && pathUsesEdge(path, edge.source, edge.target, document.directed)
    const color = onPath ? '#34d399' : highlighted ? '#A78BFA' : '#64748b'
    return {
      id: `cmp-path-${index}`,
      source: edge.source,
      target: edge.target,
      label: String(edge.weight ?? edge.label ?? 1),
      type: 'straight',
      animated: !!highlighted,
      style: { stroke: color, strokeWidth: highlighted || onPath ? 3.2 : 1.7 },
      markerEnd: document.directed ? { type: MarkerType.ArrowClosed, color } : undefined,
      labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 11 },
      labelBgStyle: { fill: '#1C1C24' },
    }
  })

  return { nodes, edges }
}

export function buildMstFlow(
  document: SavedGraph,
  step: MSTStep | null | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = document.nodes.map((node, index) => {
    const visited = step?.visited.includes(node.id) ?? false
    return {
      id: node.id,
      position: node.position ?? { x: 120 + index * 100, y: 140 },
      data: { label: node.id },
      style: {
        width: 52,
        height: 52,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        color: '#fff',
        background: visited ? '#2A2440' : '#1C1C24',
        border: `2px solid ${visited ? '#34d399' : '#33333F'}`,
      },
    }
  })

  const edges: Edge[] = document.edges.map((edge, index) => {
    const chosen = step?.selected.includes(index) ?? false
    const considered = step?.considered === index
    const candidate = step?.candidates?.includes(index) ?? false
    const color = chosen ? '#34d399' : considered ? '#fbbf24' : candidate ? '#38bdf8' : '#64748b'
    return {
      id: `cmp-mst-${index}`,
      source: edge.source,
      target: edge.target,
      label: String(edge.weight ?? edge.label ?? 1),
      type: 'straight',
      animated: considered,
      style: { stroke: color, strokeWidth: chosen || considered || candidate ? 3.2 : 1.7 },
      labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 11 },
      labelBgStyle: { fill: '#1C1C24' },
    }
  })

  return { nodes, edges }
}

export function buildSideFlow(
  document: SavedGraph,
  side: SideResult | null,
  stepIndex: number,
  end: string,
  isLast: boolean,
): { nodes: Node[]; edges: Edge[]; showDistances: boolean; algorithm: Algorithm | null } {
  if (!side) {
    return {
      ...buildPathFlow(document, null, [], false),
      showDistances: false,
      algorithm: null,
    }
  }

  if (side.kind === 'mst') {
    const step = side.result.steps[stepIndex]
    return {
      ...buildMstFlow(document, step),
      showDistances: false,
      algorithm: null,
    }
  }

  const step = side.run.steps[stepIndex]
  const path = displayPathForSide(side, end)
  const showPath = isLast
  return {
    ...buildPathFlow(document, step, path, showPath),
    showDistances: side.algorithm === 'dijkstra' || side.algorithm === 'bellman',
    algorithm: side.algorithm,
  }
}
