import {
  formatDistance,
  type Step,
  type StepEvent,
} from '../algorithms/graphAlgorithms'
import type { MSTStep, MSTStepEvent } from '../algorithms/mstAlgorithms'

export type CalloutKind = 'analyze' | 'update' | 'skip' | 'done' | 'info'

export type GraphCallout = {
  id: string
  kind: CalloutKind
  anchor: { type: 'node'; id: string } | { type: 'edge'; source: string; target: string }
  headline: string
  body: string
  /** Optional layout hint when two callouts are shown (0 = primary, 1 = secondary). */
  slot?: 0 | 1
}

function parseActiveEdge(activeEdge?: string): { source: string; target: string } | null {
  if (!activeEdge || !activeEdge.includes('|')) return null
  const [source, target] = activeEdge.split('|')
  if (!source || !target) return null
  return { source, target }
}

function kindFromSearchEvent(event: StepEvent): CalloutKind {
  if (event === 'relax' || event === 'discover') return 'update'
  if (event === 'skip') return 'skip'
  if (event === 'done') return 'done'
  if (event === 'examine' || event === 'extract' || event === 'select' || event === 'visit') return 'analyze'
  return 'info'
}

function kindFromMstEvent(event: MSTStepEvent): CalloutKind {
  if (event === 'accept' || event === 'union') return 'update'
  if (event === 'reject') return 'skip'
  if (event === 'done') return 'done'
  if (event === 'consider' || event === 'candidate' || event === 'sort') return 'analyze'
  return 'info'
}

function sameAnchor(a: GraphCallout['anchor'], b: GraphCallout['anchor']): boolean {
  if (a.type !== b.type) {
    // Edge A→B and node B (target) are treated as overlapping focus.
    if (a.type === 'edge' && b.type === 'node') return b.id === a.source || b.id === a.target
    if (b.type === 'edge' && a.type === 'node') return a.id === b.source || a.id === b.target
    return false
  }
  if (a.type === 'node' && b.type === 'node') return a.id === b.id
  if (a.type === 'edge' && b.type === 'edge') {
    return a.source === b.source && a.target === b.target
  }
  return false
}

function textTooSimilar(a: GraphCallout, b: GraphCallout): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const ha = normalize(a.headline)
  const hb = normalize(b.headline)
  const ba = normalize(a.body)
  const bb = normalize(b.body)
  if (ha === hb) return true
  if (ba.includes(bb) || bb.includes(ba)) return true
  // Same distance update mentioned twice (∞ → 4 etc.)
  const dist = /∞\s*→\s*[\d.]+|[\d.]+\s*→\s*[\d.]+/
  const ma = ba.match(dist)?.[0]
  const mb = bb.match(dist)?.[0]
  if (ma && mb && ma === mb) return true
  return false
}

function finalize(list: GraphCallout[]): GraphCallout[] {
  const unique: GraphCallout[] = []
  for (const item of list) {
    if (unique.some(existing => sameAnchor(existing.anchor, item.anchor) || textTooSimilar(existing, item))) {
      continue
    }
    unique.push(item)
    if (unique.length >= 2) break
  }
  return unique.map((item, index) => ({ ...item, slot: index as 0 | 1 }))
}

/**
 * Builds 1–2 non-duplicated graph callouts from an educational step.
 * Prefer a single focused bubble; a second one only when the focus truly differs.
 */
export function calloutsFromStep(step: Step | undefined | null): GraphCallout[] {
  if (!step) return []
  const edge = parseActiveEdge(step.activeEdge)
  const kind = kindFromSearchEvent(step.event)
  const why = step.reason ? ` ${step.reason}` : ''
  const update = step.distanceUpdates?.[0]
  const candidates: GraphCallout[] = []

  // Edge-focused steps: one bubble on the edge, with distance change folded in (no second copy on the vertex).
  if (edge && (step.event === 'examine' || step.event === 'relax' || step.event === 'skip' || step.event === 'discover')) {
    let body = step.message
    if (update && (step.event === 'relax' || step.event === 'discover')) {
      body = `${step.message} Odległość ${update.vertex}: ${formatDistance(update.previous)} → ${formatDistance(update.next)}.`
    }
    candidates.push({
      id: `edge-${edge.source}-${edge.target}-${step.event}`,
      kind,
      anchor: { type: 'edge', source: edge.source, target: edge.target },
      headline: step.title,
      body: `${body}${why}`.trim(),
    })
  } else if (update && (step.event === 'relax' || step.event === 'discover')) {
    candidates.push({
      id: `node-update-${update.vertex}`,
      kind: 'update',
      anchor: { type: 'node', id: update.vertex },
      headline: `Wierzchołek ${update.vertex}`,
      body: `Nowa odległość: ${formatDistance(update.previous)} → ${formatDistance(update.next)}.`,
    })
  }

  // Vertex-focused steps (selection / visit / init / done) — skip if we already have an edge bubble for this op.
  if (
    step.current
    && !edge
    && (step.event === 'extract' || step.event === 'visit' || step.event === 'select' || step.event === 'init' || step.event === 'done')
  ) {
    candidates.push({
      id: `node-${step.current}-${step.event}`,
      kind: step.event === 'done' ? 'done' : kind,
      anchor: { type: 'node', id: step.current },
      headline: step.title,
      body: `${step.message}${why}`.trim(),
    })
  }

  // Rare: select/visit while also examining a different edge — allow second distinct bubble.
  if (
    step.current
    && edge
    && (step.event === 'extract' || step.event === 'visit' || step.event === 'select')
    && step.current !== edge.source
    && step.current !== edge.target
  ) {
    candidates.push({
      id: `node-${step.current}-${step.event}`,
      kind: 'analyze',
      anchor: { type: 'node', id: step.current },
      headline: step.title,
      body: step.message,
    })
  }

  if (candidates.length === 0) {
    const fallbackId = step.current
      ?? step.frontier[0]
      ?? step.visited[step.visited.length - 1]
      ?? update?.vertex
      ?? null
    if (fallbackId) {
      candidates.push({
        id: `fallback-${fallbackId}`,
        kind,
        anchor: { type: 'node', id: fallbackId },
        headline: step.title,
        body: `${step.message}${why}`.trim(),
      })
    }
  }

  return finalize(candidates)
}

export function calloutsFromMstStep(step: MSTStep | undefined | null): GraphCallout[] {
  if (!step) return []
  const edge = parseActiveEdge(step.activeEdge)
  const kind = kindFromMstEvent(step.event)
  const why = step.reason ? ` ${step.reason}` : ''
  const cost = `Łączna waga: ${step.treeWeight}.`
  const focusVertex = step.visited[step.visited.length - 1] ?? null
  const candidates: GraphCallout[] = []

  if (edge) {
    candidates.push({
      id: `mst-edge-${edge.source}-${edge.target}-${step.event}`,
      kind,
      anchor: { type: 'edge', source: edge.source, target: edge.target },
      headline: step.title,
      body: `${step.message} ${cost}${why}`.trim(),
    })
  } else if (focusVertex) {
    candidates.push({
      id: `mst-node-${focusVertex}-${step.event}`,
      kind: step.event === 'done' ? 'done' : kind,
      anchor: { type: 'node', id: focusVertex },
      headline: step.title,
      body: `${step.message}${step.detail ? ` ${step.detail}` : ''} ${cost}${why}`.trim(),
    })
  }

  // Init / done without edge: keep a single vertex bubble.
  if (!edge && focusVertex && candidates.length === 0) {
    candidates.push({
      id: `mst-fallback-${focusVertex}`,
      kind,
      anchor: { type: 'node', id: focusVertex },
      headline: step.title,
      body: step.message,
    })
  }

  return finalize(candidates)
}
