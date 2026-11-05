import type { AlgorithmId, BenchGraph } from './benchmark'

export const MAX_VERTICES = 10000
export const MAX_EDGES = 100000
export type GraphSize = 100 | 400 | 1000 | 2000 | 5000 | 10000
export const graphSizes: GraphSize[] = [100, 400, 1000, 2000, 5000, 10000]

export type GraphTopology = 'erdos' | 'complete' | 'grid' | 'tree' | 'path' | 'cycle' | 'custom'

export const topologyLabels: Record<GraphTopology, string> = {
  erdos: 'Losowy (Erdős–Rényi, spójny)',
  complete: 'Graf pełny',
  grid: 'Siatka',
  tree: 'Drzewo',
  path: 'Ścieżka',
  cycle: 'Cykl',
  custom: 'Własny (edytor / biblioteka)',
}

export type GeneratorParams = {
  topology: GraphTopology
  vertices: number
  densityPercent: number
  edgeCount?: number
  seed: number
  weightMin: number
  weightMax: number
  directed: boolean
  edgeLimit?: number
}

export type GeneratorValidation = { ok: true } | { ok: false; message: string }

function createRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function emptyGraph(vertices: number): BenchGraph {
  return {
    adjacency: Array.from({ length: vertices }, () => []),
    edges: [],
  }
}

function addEdge(
  graph: BenchGraph,
  from: number,
  to: number,
  weight: number,
  directed: boolean,
  seen: Set<number>,
  vertices: number,
): boolean {
  if (from === to) return false
  const key = directed
    ? from * vertices + to
    : Math.min(from, to) * vertices + Math.max(from, to)
  if (seen.has(key)) return false
  seen.add(key)
  graph.adjacency[from].push({ to, weight })
  if (!directed) graph.adjacency[to].push({ to: from, weight })
  graph.edges.push({ from, to, weight })
  return true
}

function randomWeight(random: () => number, min: number, max: number) {
  if (min === max) return min
  return min + Math.floor(random() * (max - min + 1))
}

export function estimateEdgeCount(params: Pick<GeneratorParams, 'topology' | 'vertices' | 'densityPercent' | 'edgeCount' | 'directed' | 'edgeLimit'>): number {
  const n = params.vertices
  const limit = params.edgeLimit ?? MAX_EDGES
  if (params.topology === 'path') return Math.max(0, n - 1)
  if (params.topology === 'cycle') return n >= 3 ? n : Math.max(0, n - 1)
  if (params.topology === 'tree') return Math.max(0, n - 1)
  if (params.topology === 'complete') {
    const full = params.directed ? n * (n - 1) : n * (n - 1) / 2
    return Math.min(limit, full)
  }
  if (params.topology === 'grid') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
    const rows = Math.max(1, Math.ceil(n / cols))
    // Approximate undirected grid edges; directed doubles.
    const undirectedApprox = rows * Math.max(0, cols - 1) + cols * Math.max(0, rows - 1)
    const capped = Math.min(n * n, undirectedApprox)
    return Math.min(limit, params.directed ? capped * 2 : capped)
  }
  // erdos
  const possible = params.directed ? n * (n - 1) : n * (n - 1) / 2
  if (params.edgeCount != null && Number.isFinite(params.edgeCount)) {
    return Math.min(limit, possible, Math.max(params.directed ? 0 : Math.max(0, n - 1), Math.floor(params.edgeCount)))
  }
  const desired = Math.max(params.directed ? 0 : Math.max(0, n - 1), Math.round(possible * params.densityPercent / 100))
  return Math.min(limit, possible, desired)
}

export function validateGeneratorParams(params: GeneratorParams): GeneratorValidation {
  if (!Number.isInteger(params.vertices) || params.vertices < 2 || params.vertices > MAX_VERTICES) {
    return { ok: false, message: `Liczba wierzchołków musi być w zakresie 2–${MAX_VERTICES}.` }
  }
  if (!Number.isInteger(params.seed)) {
    return { ok: false, message: 'Ziarno generatora musi być liczbą całkowitą.' }
  }
  if (!Number.isFinite(params.densityPercent) || params.densityPercent < 0 || params.densityPercent > 100) {
    return { ok: false, message: 'Gęstość musi mieścić się w zakresie 0–100%.' }
  }
  if (!Number.isFinite(params.weightMin) || !Number.isFinite(params.weightMax) || params.weightMax < params.weightMin) {
    return { ok: false, message: 'Zakres wag musi spełniać min ≤ max (liczby skończone). Ujemne wagi są dozwolone tylko dla Bellmana–Forda.' }
  }
  if (params.edgeCount != null && (!Number.isInteger(params.edgeCount) || params.edgeCount < 0)) {
    return { ok: false, message: 'Liczba krawędzi musi być nieujemną liczbą całkowitą.' }
  }
  if (params.topology === 'cycle' && params.vertices < 3) {
    return { ok: false, message: 'Graf cykliczny wymaga co najmniej 3 wierzchołków.' }
  }
  if (params.topology === 'complete' && params.vertices > 450) {
    return { ok: false, message: 'Graf pełny jest ograniczony do 450 wierzchołków ze względu na liczbę krawędzi i pamięć.' }
  }
  const edges = estimateEdgeCount(params)
  if (edges > MAX_EDGES) {
    return { ok: false, message: `Przewidywana liczba krawędzi (${edges.toLocaleString('pl-PL')}) przekracza bezpieczny limit ${MAX_EDGES.toLocaleString('pl-PL')}.` }
  }
  // Rough memory guard: adjacency entries ≈ 2E undirected or E directed, ~24B each + edges array.
  const adjacencyEntries = params.directed ? edges : edges * 2
  const estimatedBytes = adjacencyEntries * 24 + edges * 32 + params.vertices * 8
  if (estimatedBytes > 180 * 1024 * 1024) {
    return { ok: false, message: 'Szacunkowe zużycie pamięci przekracza bezpieczny limit (~180 MB). Zmniejsz V, gęstość lub wybierz inną topologię.' }
  }
  return { ok: true }
}

function generateErdos(params: GeneratorParams): BenchGraph {
  const { vertices, seed, weightMin, weightMax, directed } = params
  const target = estimateEdgeCount(params)
  const random = createRng(seed)
  const graph = emptyGraph(vertices)
  const seen = new Set<number>()
  const weight = () => randomWeight(random, weightMin, weightMax)

  if (!directed) {
    for (let v = 1; v < vertices; v++) {
      addEdge(graph, Math.floor(random() * v), v, weight(), false, seen, vertices)
    }
  } else if (vertices > 1) {
    for (let v = 1; v < vertices; v++) {
      addEdge(graph, v - 1, v, weight(), true, seen, vertices)
    }
  }

  let attempts = 0
  const attemptLimit = Math.max(1000, target * 25)
  while (graph.edges.length < target && attempts++ < attemptLimit) {
    const a = Math.floor(random() * vertices)
    const b = Math.floor(random() * vertices)
    addEdge(graph, a, b, weight(), directed, seen, vertices)
  }

  if (graph.edges.length < target) {
    if (directed) {
      for (let a = 0; a < vertices && graph.edges.length < target; a++) {
        for (let b = 0; b < vertices && graph.edges.length < target; b++) {
          addEdge(graph, a, b, weight(), true, seen, vertices)
        }
      }
    } else {
      for (let a = 0; a < vertices && graph.edges.length < target; a++) {
        for (let b = a + 1; b < vertices && graph.edges.length < target; b++) {
          addEdge(graph, a, b, weight(), false, seen, vertices)
        }
      }
    }
  }
  return graph
}

function generateComplete(params: GeneratorParams): BenchGraph {
  const { vertices, seed, weightMin, weightMax, directed } = params
  const random = createRng(seed)
  const graph = emptyGraph(vertices)
  const seen = new Set<number>()
  const limit = params.edgeLimit ?? MAX_EDGES
  for (let a = 0; a < vertices; a++) {
    for (let b = 0; b < vertices; b++) {
      if (a === b) continue
      if (!directed && b < a) continue
      if (graph.edges.length >= limit) return graph
      addEdge(graph, a, b, randomWeight(random, weightMin, weightMax), directed, seen, vertices)
    }
  }
  return graph
}

function generateGrid(params: GeneratorParams): BenchGraph {
  const { vertices, seed, weightMin, weightMax, directed } = params
  const cols = Math.max(1, Math.ceil(Math.sqrt(vertices)))
  const rows = Math.max(1, Math.ceil(vertices / cols))
  const random = createRng(seed)
  const graph = emptyGraph(vertices)
  const seen = new Set<number>()
  const index = (r: number, c: number) => r * cols + c
  const inRange = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && index(r, c) < vertices

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = index(r, c)
      if (v >= vertices) continue
      const neighbors = [[r, c + 1], [r + 1, c]] as const
      for (const [nr, nc] of neighbors) {
        if (!inRange(nr, nc)) continue
        const u = index(nr, nc)
        addEdge(graph, v, u, randomWeight(random, weightMin, weightMax), directed, seen, vertices)
        if (directed) {
          addEdge(graph, u, v, randomWeight(random, weightMin, weightMax), true, seen, vertices)
        }
      }
    }
  }
  return graph
}

function generateTree(params: GeneratorParams): BenchGraph {
  const { vertices, seed, weightMin, weightMax, directed } = params
  const random = createRng(seed)
  const graph = emptyGraph(vertices)
  const seen = new Set<number>()
  for (let v = 1; v < vertices; v++) {
    const parent = Math.floor(random() * v)
    addEdge(graph, parent, v, randomWeight(random, weightMin, weightMax), directed, seen, vertices)
  }
  return graph
}

function generatePath(params: GeneratorParams): BenchGraph {
  const { vertices, seed, weightMin, weightMax, directed } = params
  const random = createRng(seed)
  const graph = emptyGraph(vertices)
  const seen = new Set<number>()
  for (let v = 1; v < vertices; v++) {
    addEdge(graph, v - 1, v, randomWeight(random, weightMin, weightMax), directed, seen, vertices)
  }
  return graph
}

function generateCycle(params: GeneratorParams): BenchGraph {
  const graph = generatePath(params)
  if (params.vertices < 3) return graph
  const random = createRng(params.seed ^ 0x9e3779b9)
  const seen = new Set<number>()
  for (const e of graph.edges) {
    const key = params.directed
      ? e.from * params.vertices + e.to
      : Math.min(e.from, e.to) * params.vertices + Math.max(e.from, e.to)
    seen.add(key)
  }
  addEdge(
    graph,
    params.vertices - 1,
    0,
    randomWeight(random, params.weightMin, params.weightMax),
    params.directed,
    seen,
    params.vertices,
  )
  return graph
}

export function generateBenchmarkGraph(params: GeneratorParams): BenchGraph {
  const validation = validateGeneratorParams(params)
  if (!validation.ok) throw new Error(validation.message)

  switch (params.topology) {
    case 'complete':
      return generateComplete(params)
    case 'grid':
      return generateGrid(params)
    case 'tree':
      return generateTree(params)
    case 'path':
      return generatePath(params)
    case 'cycle':
      return generateCycle(params)
    case 'erdos':
    default:
      return generateErdos(params)
  }
}

/** Sparse, reproducible connected undirected graph; never allocates an N×N matrix. */
export function generateLargeGraph(vertices: number, densityPercent: number, seed: number, edgeLimit = MAX_EDGES): BenchGraph {
  return generateBenchmarkGraph({
    topology: 'erdos',
    vertices,
    densityPercent,
    seed,
    weightMin: 1,
    weightMax: 20,
    directed: false,
    edgeLimit,
  })
}

/** Protects the UI from quadratic/cubic workloads in current benchmark implementations. */
export function algorithmLimit(id: AlgorithmId, vertices: number, edges: number): string | null {
  if ((id === 'bfs' || id === 'dfs') && (vertices > 10000 || edges > 100000)) {
    return `${id.toUpperCase()}: przekroczono limit 10 000 wierzchołków lub 100 000 krawędzi.`
  }
  if (id === 'dijkstra' && (vertices > 10000 || edges > 100000)) {
    return 'Dijkstra: przekroczono limit 10 000 wierzchołków lub 100 000 krawędzi.'
  }
  if (id === 'bellman' && (vertices > 1000 || edges > 25000)) {
    return 'Bellman–Ford: maksymalnie 1000 wierzchołków i 25 000 krawędzi.'
  }
  if ((id === 'prim' || id === 'kruskal') && (vertices > 10000 || edges > 100000)) {
    return 'Prim/Kruskal: przekroczono limit 10 000 wierzchołków lub 100 000 krawędzi.'
  }
  return null
}

/** Dijkstra is not a correct method when negative edge weights are present. */
export function algorithmWeightLimit(id: AlgorithmId, weightMin: number): string | null {
  if (id === 'dijkstra' && weightMin < 0) {
    return 'Dijkstra nie jest poprawną metodą przy ujemnych wagach — odznacz Dijkstrę albo ustaw wagę min ≥ 0 (Bellman–Ford obsługuje ujemne wagi).'
  }
  return null
}
