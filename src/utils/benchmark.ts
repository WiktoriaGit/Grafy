import type { GeneratorParams, GraphTopology } from './largeGraphs'
import type { WorkspaceGraph } from '../workspace/graphWorkspace'

export type AlgorithmId = 'bfs' | 'dfs' | 'dijkstra' | 'bellman' | 'prim' | 'kruskal'
export type BenchGraph = { adjacency: { to: number; weight: number }[][]; edges: { from: number; to: number; weight: number }[] }
export type BenchStatus = 'ran' | 'skipped' | 'error'

export type BenchResult = {
  id: string
  algorithm: AlgorithmId
  vertices: number
  edges: number
  density: number
  repetitions: number
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  operations: number
  reached: boolean
  timestamp: string
  generateMs: number
  seed: number
  directed: boolean
  topology: GraphTopology
  weightMin: number
  weightMax: number
  status?: BenchStatus
  skipReason?: string
  /** Groups rows from one experiment click. */
  runId?: string
  sourceLabel?: string
  /** Wersja metodologii pomiarowej (odróżnia nowe wyniki od historycznych). */
  methodologyVersion?: string
  /** Tryb timing: pojedyncze wywołanie vs partia dla bardzo krótkich operacji. */
  timingMode?: 'single' | 'batched'
  /** Wielkość partii przy timingMode=batched (liczba wywołań w jednym measurement window). */
  batchSize?: number
}

/** Aktualna wersja metodologii pomiarowej GraphLab (Faza B). */
export const METHODOLOGY_VERSION = 'gl-bench-2026.11'

export const algorithmLabels: Record<AlgorithmId, string> = {
  bfs: 'BFS',
  dfs: 'DFS',
  dijkstra: 'Dijkstra',
  bellman: 'Bellman–Ford',
  prim: 'Prim',
  kruskal: 'Kruskal',
}

const KNOWN_ALGORITHMS = new Set<string>(Object.keys(algorithmLabels))

export type TimeStats = {
  mean: number
  median: number
  min: number
  max: number
  stdDev: number
}

export function computeTimeStats(times: number[]): TimeStats {
  if (!times.length) throw new Error('Brak próbek czasu.')
  if (times.some(t => !Number.isFinite(t) || t < 0)) throw new Error('Nieprawidłowe próbki czasu.')
  const sorted = [...times].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  // Population standard deviation (divide by n). Documented in Results/Experiments UI.
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length
  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdDev: Math.sqrt(variance),
  }
}

export function graphDensityPercent(vertices: number, edges: number, directed: boolean): number {
  if (vertices < 2) return 0
  const possible = directed ? vertices * (vertices - 1) : vertices * (vertices - 1) / 2
  if (possible <= 0) return 0
  // Clamp: directed/undirected mismatch or multi-edges can exceed 100% of simple-graph capacity.
  return Math.min(100, Math.round((edges / possible) * 10000) / 100)
}

/** @deprecated Prefer generateBenchmarkGraph from largeGraphs.ts */
export function generateGraph(n: number, density: number, seed: number): BenchGraph {
  let state = seed >>> 0
  const rand = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
  const adjacency: BenchGraph['adjacency'] = Array.from({ length: n }, () => [])
  const edges: BenchGraph['edges'] = []
  const add = (a: number, b: number) => {
    const weight = 1 + Math.floor(rand() * 20)
    adjacency[a].push({ to: b, weight })
    adjacency[b].push({ to: a, weight })
    edges.push({ from: a, to: b, weight })
  }
  const used = new Set<string>()
  for (let v = 1; v < n; v++) {
    const u = Math.floor(rand() * v)
    add(u, v)
    used.add(`${u}:${v}`)
  }
  const maxEdges = n * (n - 1) / 2
  const target = Math.min(maxEdges, Math.max(n - 1, Math.round(maxEdges * density / 100)))
  let attempts = 0
  while (edges.length < target && attempts < target * 15 + 100) {
    attempts++
    const a = Math.floor(rand() * n)
    const b = Math.floor(rand() * n)
    if (a === b) continue
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = `${lo}:${hi}`
    if (used.has(key)) continue
    used.add(key)
    add(lo, hi)
  }
  return { adjacency, edges }
}

/** Binary min-heap for (distance, vertex); duplicate entries are skipped on pop. */
export class MinHeap {
  private items: { vertex: number; distance: number }[] = []
  get size() { return this.items.length }
  push(vertex: number, distance: number) {
    const item = { vertex, distance }
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent].distance <= item.distance) break
      a[i] = a[parent]
      i = parent
    }
    a[i] = item
  }
  pop(): { vertex: number; distance: number } | undefined {
    const a = this.items
    if (!a.length) return undefined
    const first = a[0]
    const last = a.pop()!
    if (a.length) {
      let i = 0
      while (2 * i + 1 < a.length) {
        let child = 2 * i + 1
        if (child + 1 < a.length && a[child + 1].distance < a[child].distance) child++
        if (a[child].distance >= last.distance) break
        a[i] = a[child]
        i = child
      }
      a[i] = last
    }
    return first
  }
}

export type DijkstraResult = { distances: number[]; operations: number; reached: boolean }

function validateDijkstraGraph(g: BenchGraph) {
  for (const neighbors of g.adjacency) {
    for (const e of neighbors) {
      if (!Number.isFinite(e.weight) || e.weight < 0) throw new Error('Dijkstra wymaga skończonych wag nieujemnych.')
    }
  }
}

/** Previous quadratic implementation retained as a correctness/performance baseline. */
export function dijkstraLinear(g: BenchGraph, source = 0): DijkstraResult {
  validateDijkstraGraph(g)
  const n = g.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) throw new Error('Nieprawidłowy wierzchołek początkowy.')
  const dist = Array<number>(n).fill(Infinity)
  const visited = new Uint8Array(n)
  dist[source] = 0
  let operations = 0
  for (let i = 0; i < n; i++) {
    let v = -1
    let best = Infinity
    for (let j = 0; j < n; j++) {
      operations++
      if (!visited[j] && dist[j] < best) {
        best = dist[j]
        v = j
      }
    }
    if (v < 0) break
    visited[v] = 1
    for (const e of g.adjacency[v]) {
      operations++
      if (dist[v] + e.weight < dist[e.to]) dist[e.to] = dist[v] + e.weight
    }
  }
  return { distances: dist, operations, reached: Number.isFinite(dist[n - 1]) }
}

/** Dijkstra with adjacency lists and a binary min-heap: O((V+E) log V). */
export function dijkstraHeap(g: BenchGraph, source = 0): DijkstraResult {
  validateDijkstraGraph(g)
  const n = g.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) throw new Error('Nieprawidłowy wierzchołek początkowy.')
  const dist = Array<number>(n).fill(Infinity)
  const heap = new MinHeap()
  dist[source] = 0
  heap.push(source, 0)
  let operations = 0
  while (heap.size) {
    const item = heap.pop()!
    operations++
    if (item.distance !== dist[item.vertex]) continue
    for (const e of g.adjacency[item.vertex]) {
      operations++
      const candidate = item.distance + e.weight
      if (candidate < dist[e.to]) {
        dist[e.to] = candidate
        heap.push(e.to, candidate)
      }
    }
  }
  return { distances: dist, operations, reached: Number.isFinite(dist[n - 1]) }
}

export type BenchmarkRunOptions = {
  /** Source vertex for traversal / shortest paths (default 0). */
  source?: number
}

export type BenchmarkRunResult = {
  operations: number
  /** Whether vertex n−1 is reachable from the source after the full run. */
  reached: boolean
  /** Number of vertices discovered/settled from the source (search / Dijkstra). */
  visitedCount?: number
  distances?: Float64Array | number[]
  /** Present when Bellman–Ford detects a reachable negative cycle. */
  negativeCycle?: boolean
  /** MST total weight when applicable. */
  mstWeight?: number
}

/** Convert a named/workspace graph into the numeric adjacency used by lean benchmarks. */
export function workspaceToBenchGraph(doc: WorkspaceGraph): BenchGraph {
  if (!doc.nodes.length) throw new Error('Graf nie zawiera wierzchołków.')
  const indexOf = new Map<string, number>()
  doc.nodes.forEach((node, index) => {
    if (indexOf.has(node.id)) throw new Error(`Powtórzony identyfikator wierzchołka: ${node.id}`)
    indexOf.set(node.id, index)
  })
  const adjacency: BenchGraph['adjacency'] = Array.from({ length: doc.nodes.length }, () => [])
  const edges: BenchGraph['edges'] = []
  const undirectedSeen = new Set<string>()

  for (const edge of doc.edges) {
    const from = indexOf.get(edge.source)
    const to = indexOf.get(edge.target)
    if (from == null || to == null) {
      throw new Error(`Krawędź ${edge.source} → ${edge.target} wskazuje na nieistniejący wierzchołek.`)
    }
    if (from === to) throw new Error('Pętle własne nie są obsługiwane w benchmarku.')
    if (!Number.isFinite(edge.weight)) {
      throw new Error(`Krawędź ${edge.source} → ${edge.target} ma nieprawidłową wagę.`)
    }

    if (doc.directed) {
      adjacency[from].push({ to, weight: edge.weight })
      edges.push({ from, to, weight: edge.weight })
    } else {
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      const key = `${lo}:${hi}`
      if (undirectedSeen.has(key)) continue
      undirectedSeen.add(key)
      adjacency[from].push({ to, weight: edge.weight })
      adjacency[to].push({ to: from, weight: edge.weight })
      edges.push({ from: lo, to: hi, weight: edge.weight })
    }
  }

  return { adjacency, edges }
}

/** Lean Prim with binary heap — no animation steps. */
export function primHeap(g: BenchGraph, source = 0): { operations: number; mstWeight: number; edgesUsed: number } {
  const n = g.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) throw new Error('Nieprawidłowy start Prima.')
  const inTree = new Uint8Array(n)
  const best = new Float64Array(n).fill(Infinity)
  const heap = new MinHeap()
  best[source] = 0
  heap.push(source, 0)
  let operations = 0
  let mstWeight = 0
  let edgesUsed = 0

  while (heap.size) {
    const item = heap.pop()!
    operations++
    if (inTree[item.vertex]) continue
    if (item.distance !== best[item.vertex]) continue
    inTree[item.vertex] = 1
    if (item.vertex !== source && Number.isFinite(item.distance)) {
      mstWeight += item.distance
      edgesUsed++
    }
    for (const e of g.adjacency[item.vertex]) {
      operations++
      if (!inTree[e.to] && e.weight < best[e.to]) {
        best[e.to] = e.weight
        heap.push(e.to, e.weight)
      }
    }
  }

  // Forest: restart from remaining components
  for (let v = 0; v < n; v++) {
    if (inTree[v]) continue
    best[v] = 0
    heap.push(v, 0)
    while (heap.size) {
      const item = heap.pop()!
      operations++
      if (inTree[item.vertex]) continue
      if (item.distance !== best[item.vertex]) continue
      inTree[item.vertex] = 1
      if (item.distance > 0 && Number.isFinite(item.distance)) {
        mstWeight += item.distance
        edgesUsed++
      }
      for (const e of g.adjacency[item.vertex]) {
        operations++
        if (!inTree[e.to] && e.weight < best[e.to]) {
          best[e.to] = e.weight
          heap.push(e.to, e.weight)
        }
      }
    }
  }

  return { operations, mstWeight, edgesUsed }
}

/** Lean Kruskal with Union–Find — no animation steps. */
export function kruskalUnionFind(g: BenchGraph): { operations: number; mstWeight: number; edgesUsed: number } {
  const n = g.adjacency.length
  const parent = new Int32Array(n)
  const rank = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => {
    let v = x
    while (parent[v] !== v) v = parent[v]
    let cur = x
    while (parent[cur] !== cur) {
      const next = parent[cur]
      parent[cur] = v
      cur = next
    }
    return v
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return false
    if (rank[ra] < rank[rb]) parent[ra] = rb
    else if (rank[ra] > rank[rb]) parent[rb] = ra
    else {
      parent[rb] = ra
      rank[ra]++
    }
    return true
  }

  const sorted = [...g.edges].sort((a, b) => a.weight - b.weight)
  let operations = sorted.length // sort accounted as edge comparisons bound
  let mstWeight = 0
  let edgesUsed = 0
  for (const edge of sorted) {
    operations++
    if (unite(edge.from, edge.to)) {
      mstWeight += edge.weight
      edgesUsed++
      if (edgesUsed >= n - 1) break
    }
  }
  return { operations, mstWeight, edgesUsed }
}

/**
 * Benchmark task (explicit):
 * - BFS/DFS: full exploration of the reachable component from `source` (no early-exit on a target).
 * - Dijkstra / Bellman–Ford: single-source shortest paths from `source` (distances to all reachable vertices).
 * - Prim / Kruskal: MST / minimum spanning forest on undirected graphs.
 * Do not treat these three problem classes as interchangeable.
 *
 * Graph representation: `adjacency[u]` lists only existing directed arcs.
 * Undirected generators store each undirected edge once in `edges` and both directions in `adjacency`.
 * Bellman–Ford therefore relaxes only via adjacency (never fabricates reverse arcs).
 */
export function runBenchmarkAlgorithm(
  g: BenchGraph,
  id: AlgorithmId,
  options?: BenchmarkRunOptions,
): BenchmarkRunResult {
  const n = g.adjacency.length
  const source = options?.source ?? 0
  if (!Number.isInteger(source) || source < 0 || source >= n) {
    throw new Error('Nieprawidłowy wierzchołek źródłowy benchmarku.')
  }
  const target = n - 1

  if (id === 'bfs' || id === 'dfs') {
    const seen = new Uint8Array(n)
    const queue = [source]
    seen[source] = 1
    let head = 0
    let operations = 0
    let visitedCount = 0
    while (id === 'bfs' ? head < queue.length : queue.length > 0) {
      const v = id === 'bfs' ? queue[head++] : queue.pop()!
      visitedCount++
      for (const e of g.adjacency[v]) {
        operations++
        if (!seen[e.to]) {
          seen[e.to] = 1
          queue.push(e.to)
        }
      }
    }
    return {
      operations,
      reached: seen[target] === 1,
      visitedCount,
    }
  }

  if (id === 'dijkstra') {
    const result = dijkstraHeap(g, source)
    return {
      operations: result.operations,
      reached: result.reached,
      distances: result.distances,
      visitedCount: result.distances.filter(d => Number.isFinite(d)).length,
    }
  }

  if (id === 'prim') {
    const result = primHeap(g, source)
    return {
      operations: result.operations,
      reached: result.edgesUsed >= Math.max(0, n - 1),
      mstWeight: result.mstWeight,
      visitedCount: n,
    }
  }

  if (id === 'kruskal') {
    const result = kruskalUnionFind(g)
    return {
      operations: result.operations,
      reached: result.edgesUsed >= Math.max(0, n - 1),
      mstWeight: result.mstWeight,
      visitedCount: n,
    }
  }

  // Bellman–Ford: relax only arcs present in adjacency (directed-safe; undirected already duplicated there).
  const dist = new Float64Array(n).fill(Infinity)
  dist[source] = 0
  let operations = 0
  for (let iter = 1; iter < n; iter++) {
    let changed = false
    for (let u = 0; u < n; u++) {
      if (!Number.isFinite(dist[u])) continue
      for (const e of g.adjacency[u]) {
        operations++
        const candidate = dist[u] + e.weight
        if (candidate < dist[e.to]) {
          dist[e.to] = candidate
          changed = true
        }
      }
    }
    if (!changed) break
  }

  // Extra pass: detect a negative cycle reachable from the source (relevant if negative weights are allowed).
  for (let u = 0; u < n; u++) {
    if (!Number.isFinite(dist[u])) continue
    for (const e of g.adjacency[u]) {
      operations++
      if (dist[u] + e.weight < dist[e.to]) {
        return {
          operations,
          reached: false,
          distances: dist,
          negativeCycle: true,
          visitedCount: [...dist].filter(d => Number.isFinite(d)).length,
        }
      }
    }
  }

  return {
    operations,
    reached: Number.isFinite(dist[target]),
    distances: dist,
    visitedCount: [...dist].filter(d => Number.isFinite(d)).length,
  }
}

/** Short Polish description of what each benchmark algorithm measures. */
export const BENCHMARK_TASK_HINTS: Record<AlgorithmId, string> = {
  bfs: 'Pełne przeszukiwanie wszerz osiągalnej części grafu od źródła (bez wcześniejszego przerwania na celu). Nie jest algorytmem minimalnego kosztu wagowego.',
  dfs: 'Pełne przeszukiwanie w głąb osiągalnej części grafu od źródła. Nie wyznacza najkrótszej drogi ani MST.',
  dijkstra: 'Najkrótsze ścieżki od źródła (implementacja z kopcem binarnym) — wymaga wag nieujemnych.',
  bellman: 'Najkrótsze ścieżki od źródła (Bellman–Ford); ujemne wagi OK, osiągalny ujemny cykl → wynik nieokreślony.',
  prim: 'Minimalne drzewo / las rozpinający (Prim z kopcem) — tylko graf nieskierowany; inny problem niż najkrótsza ścieżka.',
  kruskal: 'Minimalne drzewo / las rozpinający (Kruskal + Union–Find) — tylko graf nieskierowany.',
}

export type MeasureMeta = {
  generateMs: number
  seed: number
  directed: boolean
  topology: GraphTopology
  weightMin: number
  weightMax: number
  runId?: string
  sourceLabel?: string
}

export type BenchmarkRequest = {
  repetitions: number
  selected: AlgorithmId[]
  /** generator | workspace payload sent from the main thread */
  source: 'generator' | 'custom'
  graph?: BenchGraph
  directed?: boolean
  topology?: GraphTopology
  weightMin?: number
  weightMax?: number
  seed?: number
  sourceLabel?: string
  runId?: string
  generateMs?: number
} & Partial<GeneratorParams>

export function emptyTiming(): Pick<BenchResult, 'mean' | 'median' | 'stdDev' | 'min' | 'max' | 'operations' | 'reached'> {
  return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, operations: 0, reached: false }
}

export function skippedResult(
  g: BenchGraph,
  id: AlgorithmId,
  reason: string,
  meta?: Partial<MeasureMeta>,
  status: BenchStatus = 'skipped',
): BenchResult {
  const directed = meta?.directed ?? false
  return {
    id: `${Date.now()}-${id}-${Math.random().toString(36).slice(2, 8)}`,
    algorithm: id,
    vertices: g.adjacency.length,
    edges: g.edges.length,
    density: graphDensityPercent(g.adjacency.length, g.edges.length, directed),
    repetitions: 0,
    ...emptyTiming(),
    timestamp: new Date().toISOString(),
    generateMs: meta?.generateMs ?? 0,
    seed: meta?.seed ?? 0,
    directed,
    topology: meta?.topology ?? 'custom',
    weightMin: meta?.weightMin ?? 0,
    weightMax: meta?.weightMax ?? 0,
    status,
    skipReason: reason,
    runId: meta?.runId,
    sourceLabel: meta?.sourceLabel,
  }
}

/** Próg (ms): poniżej — adaptive batching (M2). */
export const BATCH_PROBE_THRESHOLD_MS = 0.5
/** Docelowy czas jednej partii (ms). */
export const BATCH_TARGET_MS = 5
/** Górny limit wywołań w jednej partii — chroni UI/worker przed zawieszeniem. */
export const BATCH_MAX_SIZE = 64

/** M1: kolejność algorytmów w powtórzeniu `rep` (rotacja cykliczna). */
export function fairRepetitionOrder<T>(items: readonly T[], rep: number): T[] {
  if (!items.length) return []
  const n = items.length
  const shift = ((rep % n) + n) % n
  return items.map((_, index) => items[(index + shift) % n])
}

export function resolveBatchSize(probeMs: number): number {
  if (!(probeMs > 0) || probeMs >= BATCH_PROBE_THRESHOLD_MS) return 1
  const estimated = Math.ceil(BATCH_TARGET_MS / probeMs)
  return Math.min(BATCH_MAX_SIZE, Math.max(2, estimated))
}

function timeOneOrBatch(
  g: BenchGraph,
  id: AlgorithmId,
  batchSize: number,
): { sampleMs: number; operations: number; reached: boolean; negativeCycle?: boolean } {
  if (batchSize <= 1) {
    const start = performance.now()
    const result = runBenchmarkAlgorithm(g, id)
    return {
      sampleMs: performance.now() - start,
      operations: result.operations,
      reached: result.reached,
      negativeCycle: result.negativeCycle,
    }
  }
  const start = performance.now()
  let operations = 0
  let reached = false
  for (let k = 0; k < batchSize; k++) {
    const result = runBenchmarkAlgorithm(g, id)
    operations = result.operations
    reached = result.reached
    if (result.negativeCycle) {
      return {
        sampleMs: (performance.now() - start) / Math.max(1, k + 1),
        operations,
        reached,
        negativeCycle: true,
      }
    }
  }
  return {
    sampleMs: (performance.now() - start) / batchSize,
    operations,
    reached,
  }
}

function buildMeasuredResult(
  g: BenchGraph,
  id: AlgorithmId,
  repetitions: number,
  times: number[],
  operations: number,
  reached: boolean,
  meta: Partial<MeasureMeta> | undefined,
  timingMode: 'single' | 'batched',
  batchSize: number,
): BenchResult {
  const stats = computeTimeStats(times)
  const directed = meta?.directed ?? false
  return {
    id: `${Date.now()}-${id}-${Math.random().toString(36).slice(2, 8)}`,
    algorithm: id,
    vertices: g.adjacency.length,
    edges: g.edges.length,
    density: graphDensityPercent(g.adjacency.length, g.edges.length, directed),
    repetitions,
    mean: stats.mean,
    median: stats.median,
    stdDev: stats.stdDev,
    min: stats.min,
    max: stats.max,
    operations,
    reached,
    timestamp: new Date().toISOString(),
    generateMs: meta?.generateMs ?? 0,
    seed: meta?.seed ?? 0,
    directed,
    topology: meta?.topology ?? 'erdos',
    weightMin: meta?.weightMin ?? 1,
    weightMax: meta?.weightMax ?? 20,
    status: 'ran',
    runId: meta?.runId,
    sourceLabel: meta?.sourceLabel,
    methodologyVersion: METHODOLOGY_VERSION,
    timingMode,
    batchSize: timingMode === 'batched' ? batchSize : 1,
  }
}

/**
 * Pomiar pojedynczego algorytmu (M2: adaptive batching).
 * Warm-up + opcjonalne partie dla operacji &lt; 0.5 ms.
 * Generowanie grafu / walidacja / UI — poza tą funkcją.
 */
export function measure(g: BenchGraph, id: AlgorithmId, repetitions: number, meta?: Partial<MeasureMeta>): BenchResult {
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('Nieprawidłowa liczba powtórzeń.')
  const warm = runBenchmarkAlgorithm(g, id)
  if (warm.negativeCycle) {
    return skippedResult(
      g,
      id,
      'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
      meta,
      'error',
    )
  }

  const probeStart = performance.now()
  const probe = runBenchmarkAlgorithm(g, id)
  const probeMs = performance.now() - probeStart
  if (probe.negativeCycle) {
    return skippedResult(
      g,
      id,
      'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
      meta,
      'error',
    )
  }

  const batchSize = resolveBatchSize(probeMs)
  const timingMode: 'single' | 'batched' = batchSize > 1 ? 'batched' : 'single'
  const times: number[] = []
  // Pierwsza próbka = wynik sondażu (znormalizowany do 1 wywołania); przy batching nie używamy sondażu jako próbki.
  if (timingMode === 'single') {
    times.push(probeMs)
  }
  let operations = probe.operations
  let reached = probe.reached

  const remaining = timingMode === 'single' ? repetitions - 1 : repetitions
  for (let i = 0; i < remaining; i++) {
    const sample = timeOneOrBatch(g, id, batchSize)
    if (sample.negativeCycle) {
      return skippedResult(
        g,
        id,
        'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
        meta,
        'error',
      )
    }
    times.push(sample.sampleMs)
    operations = sample.operations
    reached = sample.reached
  }

  return buildMeasuredResult(g, id, repetitions, times, operations, reached, meta, timingMode, batchSize)
}

/**
 * M1: sprawiedliwy pomiar wielu algorytmów na tym samym grafie.
 * W kolejnych powtórzeniach rotujemy kolejność (A→B→…, potem B→…→A, …),
 * aby ograniczyć wpływ kolejności JIT. Warm-up przed pętlą; poza pomiarem: generowanie/UI.
 */
export function measureAlgorithmsFair(
  g: BenchGraph,
  ids: AlgorithmId[],
  repetitions: number,
  meta?: Partial<MeasureMeta>,
): BenchResult[] {
  if (!ids.length) return []
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('Nieprawidłowa liczba powtórzeń.')

  const blocked = new Map<AlgorithmId, BenchResult>()
  const batchSizes = new Map<AlgorithmId, number>()
  const timingModes = new Map<AlgorithmId, 'single' | 'batched'>()

  for (const id of ids) {
    // Warm-up (poza statystykami).
    const warm = runBenchmarkAlgorithm(g, id)
    if (warm.negativeCycle) {
      blocked.set(id, skippedResult(
        g,
        id,
        'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
        meta,
        'error',
      ))
      continue
    }
    // Sondaż batchingu (poza fair loop).
    const probeStart = performance.now()
    const probe = runBenchmarkAlgorithm(g, id)
    const probeMs = performance.now() - probeStart
    if (probe.negativeCycle) {
      blocked.set(id, skippedResult(
        g,
        id,
        'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
        meta,
        'error',
      ))
      continue
    }
    const bs = resolveBatchSize(probeMs)
    batchSizes.set(id, bs)
    timingModes.set(id, bs > 1 ? 'batched' : 'single')
  }

  const runnable = ids.filter(id => !blocked.has(id))
  if (!runnable.length) return ids.map(id => blocked.get(id)!)

  const times = new Map<AlgorithmId, number[]>(runnable.map(id => [id, []]))
  const ops = new Map<AlgorithmId, number>()
  const reachedMap = new Map<AlgorithmId, boolean>()

  for (let rep = 0; rep < repetitions; rep++) {
    // M1: rotacja kolejności A→B→… / B→…→A w kolejnych powtórzeniach.
    const order = fairRepetitionOrder(runnable, rep)
    for (const id of order) {
      if (blocked.has(id)) continue
      const sample = timeOneOrBatch(g, id, batchSizes.get(id) ?? 1)
      if (sample.negativeCycle) {
        blocked.set(id, skippedResult(
          g,
          id,
          'Wykryto osiągalny ujemny cykl — najkrótsze ścieżki są nieokreślone; pomiar nie jest traktowany jako poprawny wynik.',
          meta,
          'error',
        ))
        times.delete(id)
        continue
      }
      times.get(id)?.push(sample.sampleMs)
      ops.set(id, sample.operations)
      reachedMap.set(id, sample.reached)
    }
  }

  return ids.map(id => {
    if (blocked.has(id)) return blocked.get(id)!
    const samples = times.get(id)
    if (!samples?.length) {
      return skippedResult(g, id, 'Brak próbek czasu po pomiarze fair.', meta, 'error')
    }
    return buildMeasuredResult(
      g,
      id,
      repetitions,
      samples,
      ops.get(id) ?? 0,
      reachedMap.get(id) ?? false,
      meta,
      timingModes.get(id) ?? 'single',
      batchSizes.get(id) ?? 1,
    )
  })
}

export const STORAGE_KEY = 'graphlab-benchmarks-v2'
const LEGACY_STORAGE_KEY = 'graphlab-benchmarks-v1'

function normalizeResult(raw: unknown): BenchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.algorithm !== 'string' || !KNOWN_ALGORITHMS.has(r.algorithm)) return null
  if (typeof r.vertices !== 'number' || typeof r.mean !== 'number') return null
  const mean = Number(r.mean)
  const min = Number(r.min ?? mean)
  const max = Number(r.max ?? mean)
  const median = Number(r.median ?? mean)
  const stdDev = Number(r.stdDev ?? 0)
  const status = r.status === 'skipped' || r.status === 'error' || r.status === 'ran'
    ? r.status
    : 'ran'
  return {
    id: String(r.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    algorithm: r.algorithm as AlgorithmId,
    vertices: Number(r.vertices),
    edges: Number(r.edges ?? 0),
    density: Number(r.density ?? 0),
    repetitions: Number(r.repetitions ?? 1),
    mean,
    median,
    stdDev,
    min,
    max,
    operations: Number(r.operations ?? 0),
    reached: Boolean(r.reached),
    timestamp: String(r.timestamp ?? new Date().toISOString()),
    generateMs: Number(r.generateMs ?? 0),
    seed: Number(r.seed ?? 0),
    directed: Boolean(r.directed),
    topology: (r.topology as GraphTopology) || 'erdos',
    weightMin: Number(r.weightMin ?? 1),
    weightMax: Number(r.weightMax ?? 20),
    status,
    skipReason: typeof r.skipReason === 'string' ? r.skipReason : undefined,
    runId: typeof r.runId === 'string' ? r.runId : undefined,
    sourceLabel: typeof r.sourceLabel === 'string' ? r.sourceLabel : undefined,
    methodologyVersion: typeof r.methodologyVersion === 'string' ? r.methodologyVersion : undefined,
    timingMode: r.timingMode === 'single' || r.timingMode === 'batched' ? r.timingMode : undefined,
    batchSize: typeof r.batchSize === 'number' && Number.isFinite(r.batchSize) ? r.batchSize : undefined,
  }
}

export function loadResults(): BenchResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeResult).filter((row): row is BenchResult => row != null)
  } catch {
    return []
  }
}

export function saveResults(rows: BenchResult[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 200)))
}

export function exportCSV(rows: BenchResult[]) {
  const header = [
    'algorytm', 'topologia', 'wierzcholki', 'krawedzie', 'gestosc_proc', 'skierowany', 'seed',
    'waga_min', 'waga_max', 'powtorzenia', 'srednia_ms', 'mediana_ms', 'odch_std_ms',
    'min_ms', 'max_ms', 'czas_generowania_ms', 'operacje', 'osiagnieto_cel', 'data',
  ]
  const lines = rows.map(r => [
    algorithmLabels[r.algorithm],
    r.topology,
    r.vertices,
    r.edges,
    r.density,
    r.directed ? 1 : 0,
    r.seed,
    r.weightMin,
    r.weightMax,
    r.repetitions,
    r.mean.toFixed(5),
    r.median.toFixed(5),
    r.stdDev.toFixed(5),
    r.min.toFixed(5),
    r.max.toFixed(5),
    r.generateMs.toFixed(5),
    r.operations,
    r.reached,
    r.timestamp,
  ].join(';'))
  const blob = new Blob(['\uFEFF' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'graphlab-wyniki.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
