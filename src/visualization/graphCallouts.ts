import {
  formatDistance,
  type Step,
  type StepEvent,
} from '../algorithms/graphAlgorithms'
import type { MSTStep, MSTStepEvent } from '../algorithms/mstAlgorithms'

export type CalloutKind = 'analyze' | 'update' | 'skip' | 'done' | 'info'

export type CalloutAnchor =
  | { type: 'node'; id: string }
  | { type: 'edge'; source: string; target: string }
  | { type: 'canvas' }

export type GraphCallout = {
  /** Stable id for this step's active callout (includes step fingerprint). */
  id: string
  kind: CalloutKind
  anchor: CalloutAnchor
  headline: string
  body: string
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

function fingerprint(parts: Array<string | number | null | undefined>): string {
  return parts.map(p => (p == null ? '' : String(p))).join('|')
}

function shortBody(message: string, reason?: string, max = 180): string {
  const text = `${message}${reason ? ` ${reason}` : ''}`.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/**
 * Exactly one active callout for a path/search/shortest-path step.
 * Anchoring rules follow the operation type (edge vs vertex vs canvas).
 */
export function calloutFromStep(
  step: Step | undefined | null,
  stepIndex = 0,
): GraphCallout | null {
  if (!step) return null

  const edge = parseActiveEdge(step.activeEdge)
  const kind = kindFromSearchEvent(step.event)
  const update = step.distanceUpdates?.[0]
  const why = step.reason

  // 1) Edge inspection / skip — always on the edge.
  if (edge && (step.event === 'examine' || step.event === 'skip')) {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'edge', edge.source, edge.target]),
      kind,
      anchor: { type: 'edge', source: edge.source, target: edge.target },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  // 2) Relax / discover with distance change — on the updated vertex.
  if (update && (step.event === 'relax' || step.event === 'discover')) {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'node', update.vertex, update.next]),
      kind: 'update',
      anchor: { type: 'node', id: update.vertex },
      headline: step.title,
      body: shortBody(
        `${step.message} d(${update.vertex}): ${formatDistance(update.previous)} → ${formatDistance(update.next)}.`,
        why,
      ),
    }
  }

  // 3) Discover without distanceUpdates — on the newly found vertex (edge target).
  if (edge && step.event === 'discover') {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'node', edge.target]),
      kind: 'update',
      anchor: { type: 'node', id: edge.target },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  // 4) Relax without update map — on the active edge.
  if (edge && step.event === 'relax') {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'edge', edge.source, edge.target]),
      kind,
      anchor: { type: 'edge', source: edge.source, target: edge.target },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  // 5) Selection / visit / extract / init — on current vertex.
  if (
    step.current
    && (step.event === 'select' || step.event === 'visit' || step.event === 'extract' || step.event === 'init')
  ) {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'node', step.current]),
      kind,
      anchor: { type: 'node', id: step.current },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  // 6) Done / generic — fixed canvas callout (not tied to a random vertex).
  if (step.event === 'done' || step.event === 'init') {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'canvas']),
      kind: step.event === 'done' ? 'done' : 'info',
      anchor: { type: 'canvas' },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  // 7) Last resort: current / frontier / last visited.
  const fallback = step.current
    ?? step.frontier[0]
    ?? step.visited[step.visited.length - 1]
    ?? null
  if (fallback) {
    return {
      id: fingerprint(['path', stepIndex, step.event, 'node', fallback]),
      kind,
      anchor: { type: 'node', id: fallback },
      headline: step.title,
      body: shortBody(step.message, why),
    }
  }

  return {
    id: fingerprint(['path', stepIndex, step.event, 'canvas']),
    kind,
    anchor: { type: 'canvas' },
    headline: step.title,
    body: shortBody(step.message, why),
  }
}

/**
 * Exactly one active callout for an MST step.
 */
export function calloutFromMstStep(
  step: MSTStep | undefined | null,
  stepIndex = 0,
): GraphCallout | null {
  if (!step) return null

  const edge = parseActiveEdge(step.activeEdge)
  const kind = kindFromMstEvent(step.event)
  const why = step.reason
  const costNote = `Łączna waga: ${step.treeWeight}.`
  const focusVertex = step.visited[step.visited.length - 1] ?? null

  if (edge && (step.event === 'consider' || step.event === 'accept' || step.event === 'reject' || step.event === 'candidate')) {
    return {
      id: fingerprint(['mst', stepIndex, step.event, 'edge', edge.source, edge.target]),
      kind,
      anchor: { type: 'edge', source: edge.source, target: edge.target },
      headline: step.title,
      body: shortBody(`${step.message} ${costNote}`, why),
    }
  }

  if (step.event === 'done' || step.event === 'init' || step.event === 'sort') {
    return {
      id: fingerprint(['mst', stepIndex, step.event, 'canvas']),
      kind: step.event === 'done' ? 'done' : kind,
      anchor: { type: 'canvas' },
      headline: step.title,
      body: shortBody(`${step.message} ${costNote}`, why),
    }
  }

  if (focusVertex) {
    return {
      id: fingerprint(['mst', stepIndex, step.event, 'node', focusVertex]),
      kind,
      anchor: { type: 'node', id: focusVertex },
      headline: step.title,
      body: shortBody(`${step.message} ${costNote}`, why),
    }
  }

  return {
    id: fingerprint(['mst', stepIndex, step.event, 'canvas']),
    kind,
    anchor: { type: 'canvas' },
    headline: step.title,
    body: shortBody(step.message, why),
  }
}

/** @deprecated Prefer calloutFromStep — kept as array adapter for overlay API. */
export function calloutsFromStep(step: Step | undefined | null, stepIndex = 0): GraphCallout[] {
  const one = calloutFromStep(step, stepIndex)
  return one ? [one] : []
}

/** @deprecated Prefer calloutFromMstStep — kept as array adapter for overlay API. */
export function calloutsFromMstStep(step: MSTStep | undefined | null, stepIndex = 0): GraphCallout[] {
  const one = calloutFromMstStep(step, stepIndex)
  return one ? [one] : []
}
