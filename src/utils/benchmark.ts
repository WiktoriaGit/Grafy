import type { GeneratorParams, GraphTopology } from './largeGraphs'

export type AlgorithmId = 'bfs' | 'dfs' | 'dijkstra' | 'bellman'
export type BenchGraph = { adjacency: { to: number; weight: number }[][]; edges: { from: number; to: number; weight: number }[] }

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
}

export const algorithmLabels: Record<AlgorithmId, string> = {
  bfs: 'BFS',
  dfs: 'DFS',
  dijkstra: 'Dijkstra',
  bellman: 'Bellman–Ford',
}

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
  return Math.round((edges / possible) * 10000) / 100
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
}

/**
 * Benchmark task (explicit):
 * - BFS/DFS: full exploration of the reachable component from `source` (no early-exit on a target).
 * - Dijkstra / Bellman–Ford: single-source shortest paths from `source` (distances to all reachable vertices).
 * Do not treat search timings as interchangeable with shortest-path timings.
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
  bfs: 'Pełne przeszukiwanie wszerz osiągalnej części grafu od źródła (bez wcześniejszego przerwania na celu).',
  dfs: 'Pełne przeszukiwanie w głąb osiągalnej części grafu od źródła (bez wcześniejszego przerwania na celu).',
  dijkstra: 'Najkrótsze ścieżki od źródła (implementacja z kopcem binarnym) — inny problem niż samo BFS/DFS.',
  bellman: 'Najkrótsze ścieżki od źródła (Bellman–Ford); relaksacja wyłącznie istniejących łuków w liście sąsiedztwa.',
}

export type MeasureMeta = {
  generateMs: number
  seed: number
  directed: boolean
  topology: GraphTopology
  weightMin: number
  weightMax: number
}

export type BenchmarkRequest = GeneratorParams & {
  repetitions: number
  selected: AlgorithmId[]
}

export function measure(g: BenchGraph, id: AlgorithmId, repetitions: number, meta?: Partial<MeasureMeta>): BenchResult {
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('Nieprawidłowa liczba powtórzeń.')
  // Warm-up reduces one-time JIT effects; results remain environment-dependent.
  // Timing wraps only the lean algorithm — never educational step generation or React Flow animation.
  runBenchmarkAlgorithm(g, id)
  const times: number[] = []
  let operations = 0
  let reached = false
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now()
    const result = runBenchmarkAlgorithm(g, id)
    times.push(performance.now() - start)
    operations = result.operations
    reached = result.reached
  }
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
  }
}

export const STORAGE_KEY = 'graphlab-benchmarks-v2'
const LEGACY_STORAGE_KEY = 'graphlab-benchmarks-v1'

function normalizeResult(raw: unknown): BenchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.algorithm !== 'string' || typeof r.vertices !== 'number' || typeof r.mean !== 'number') return null
  const mean = Number(r.mean)
  const min = Number(r.min ?? mean)
  const max = Number(r.max ?? mean)
  const median = Number(r.median ?? mean)
  const stdDev = Number(r.stdDev ?? 0)
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
