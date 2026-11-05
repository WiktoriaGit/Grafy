import { MarkerType, type Edge, type Node } from '@xyflow/react'

export const WORKSPACE_KEY = 'graphlab-editor-v1'
export const WORKSPACE_META_KEY = 'graphlab-workspace-meta-v1'

export type WorkspaceNode = { id: string; position: { x: number; y: number }; label?: string }
export type WorkspaceEdge = {
  source: string
  target: string
  weight: number
  sourceHandle?: string
  targetHandle?: string
}

export const VERTEX_NODE_TYPE = 'graphVertex' as const
export const VERTEX_HANDLE_IDS = ['top', 'right', 'bottom', 'left'] as const
export type VertexHandleId = (typeof VERTEX_HANDLE_IDS)[number]

function isHandleId(value: unknown): value is VertexHandleId {
  return typeof value === 'string' && (VERTEX_HANDLE_IDS as readonly string[]).includes(value)
}
export type WorkspaceGraph = {
  version: 1
  directed: boolean
  nodes: WorkspaceNode[]
  edges: WorkspaceEdge[]
  start?: string
  end?: string
}

export type WorkspaceMeta = {
  source: 'editor' | 'demo' | 'file'
  updatedAt: string
  openInAlgorithms?: boolean
  openInComparison?: boolean
}

const edgeStyle = { stroke: '#7c8ba7', strokeWidth: 2 }

export function makeEditorNode(id: string, x: number, y: number, label = id): Node {
  return {
    id,
    type: VERTEX_NODE_TYPE,
    position: { x, y },
    data: { label },
    // Appearance is rendered by GraphVertexNode (.ge-vertex). Avoid outer style so
    // handle anchors sit on the circle perimeter instead of a double-sized wrapper.
  }
}

export function makeEditorEdge(
  source: string,
  target: string,
  weight: number,
  directed: boolean,
  handles?: { sourceHandle?: string | null; targetHandle?: string | null },
): Edge {
  const sourceHandle = isHandleId(handles?.sourceHandle) ? handles.sourceHandle : undefined
  const targetHandle = isHandleId(handles?.targetHandle) ? handles.targetHandle : undefined
  return {
    id: `${source}-${target}-${crypto.randomUUID()}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    label: String(weight),
    // Bezier paths leave circular nodes at the chosen perimeter handle instead of crossing the disk.
    type: 'default',
    style: edgeStyle,
    markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined,
    labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 12 },
    labelBgStyle: { fill: '#17243a', fillOpacity: 1 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 5,
  }
}

export function decorateEdge(edge: Edge, directed: boolean): Edge {
  return {
    ...edge,
    markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined,
  }
}

export function serializeWorkspace(
  nodes: Node[],
  edges: Edge[],
  directed: boolean,
  start?: string,
  end?: string,
): WorkspaceGraph {
  return {
    version: 1,
    directed,
    nodes: nodes.map(n => ({
      id: n.id,
      position: n.position,
      label: String(n.data?.label ?? n.id),
    })),
    edges: edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: Number(e.label ?? 1),
      ...(isHandleId(e.sourceHandle) ? { sourceHandle: e.sourceHandle } : {}),
      ...(isHandleId(e.targetHandle) ? { targetHandle: e.targetHandle } : {}),
    })),
    start,
    end,
  }
}

export function workspaceToFlow(doc: WorkspaceGraph): { nodes: Node[]; edges: Edge[]; directed: boolean } {
  return {
    directed: doc.directed,
    nodes: doc.nodes.map(n => makeEditorNode(n.id, n.position.x, n.position.y, n.label ?? n.id)),
    edges: doc.edges.map(e => makeEditorEdge(e.source, e.target, e.weight, doc.directed, {
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }
}

export function parseWorkspace(raw: unknown): WorkspaceGraph {
  if (!raw || typeof raw !== 'object') throw new Error('Nie udało się odczytać grafu. Sprawdź, czy plik ma poprawny format.')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges) || typeof obj.directed !== 'boolean') {
    throw new Error('Plik nie zawiera kompletnego grafu (wierzchołki, krawędzie i typ grafu).')
  }
  if (obj.nodes.length > 300 || obj.edges.length > 3000) {
    throw new Error('Graf jest zbyt duży dla edytora (limit: 300 wierzchołków i 3000 krawędzi).')
  }

  const ids = new Set<string>()
  const nodes: WorkspaceNode[] = obj.nodes.map((item: unknown) => {
    const n = item as Record<string, unknown>
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id)) {
      throw new Error('Wierzchołek ma nieprawidłowy lub powtórzony identyfikator.')
    }
    const pos = n.position as Record<string, unknown> | undefined
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      throw new Error(`Wierzchołek ${n.id} ma nieprawidłowe współrzędne.`)
    }
    ids.add(n.id)
    return {
      id: n.id,
      position: { x: pos.x, y: pos.y },
      label: typeof n.label === 'string' ? n.label : n.id,
    }
  })

  const edges: WorkspaceEdge[] = obj.edges.map((item: unknown) => {
    const e = item as Record<string, unknown>
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') {
      throw new Error('Krawędź ma nieprawidłowe końce.')
    }
    if (!ids.has(e.source) || !ids.has(e.target)) {
      throw new Error(`Krawędź ${e.source} → ${e.target} wskazuje na nieistniejący wierzchołek.`)
    }
    if (e.source === e.target) {
      throw new Error('Pętle własne (krawędź z wierzchołka do siebie) nie są obsługiwane w edytorze.')
    }
    const weight = Number(e.weight ?? e.label ?? 1)
    if (!Number.isFinite(weight)) {
      throw new Error(`Krawędź ${e.source} → ${e.target} ma nieprawidłową wagę.`)
    }
    return {
      source: e.source,
      target: e.target,
      weight,
      ...(isHandleId(e.sourceHandle) ? { sourceHandle: e.sourceHandle } : {}),
      ...(isHandleId(e.targetHandle) ? { targetHandle: e.targetHandle } : {}),
    }
  })

  return {
    version: 1,
    directed: obj.directed,
    nodes,
    edges,
    start: typeof obj.start === 'string' ? obj.start : undefined,
    end: typeof obj.end === 'string' ? obj.end : undefined,
  }
}

export function saveWorkspace(graph: WorkspaceGraph, meta?: Partial<WorkspaceMeta>) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(graph))
  const payload: WorkspaceMeta = {
    source: meta?.source ?? 'editor',
    updatedAt: new Date().toISOString(),
    openInAlgorithms: meta?.openInAlgorithms ?? false,
    openInComparison: meta?.openInComparison ?? false,
  }
  localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify(payload))
}

export function loadWorkspace(): WorkspaceGraph | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return null
    return parseWorkspace(JSON.parse(raw))
  } catch {
    return null
  }
}

export function loadWorkspaceMeta(): WorkspaceMeta | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceMeta
    return parsed
  } catch {
    return null
  }
}

export function clearOpenInAlgorithmsFlag() {
  const meta = loadWorkspaceMeta()
  if (!meta) return
  localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify({ ...meta, openInAlgorithms: false }))
}

export function clearOpenInComparisonFlag() {
  const meta = loadWorkspaceMeta()
  if (!meta) return
  localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify({ ...meta, openInComparison: false }))
}

export function nextVertexId(existing: Iterable<string>): string {
  const used = new Set(existing)
  let index = 1
  while (used.has(`V${index}`)) index++
  return `V${index}`
}

export function autoLayoutPositions(count: number, width = 720, height = 460): Array<{ x: number; y: number }> {
  if (count <= 0) return []
  if (count === 1) return [{ x: width / 2, y: height / 2 }]
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.36
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })
}
