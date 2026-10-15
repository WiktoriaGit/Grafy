import type { AlgorithmId, BenchGraph } from './benchmark'

export const MAX_VERTICES = 10000
export const MAX_EDGES = 100000
export type GraphSize = 100 | 400 | 1000 | 2000 | 5000 | 10000
export const graphSizes: GraphSize[] = [100, 400, 1000, 2000, 5000, 10000]

/** Sparse, reproducible connected undirected graph; never allocates an N×N matrix. */
export function generateLargeGraph(vertices: number, densityPercent: number, seed: number, edgeLimit = MAX_EDGES): BenchGraph {
  if (!Number.isInteger(vertices) || vertices < 2 || vertices > MAX_VERTICES) throw new Error(`Liczba wierzchołków musi być w zakresie 2–${MAX_VERTICES}.`)
  if (!Number.isFinite(densityPercent) || densityPercent < 0 || densityPercent > 100) throw new Error('Gęstość musi mieścić się w zakresie 0–100%.')
  if (!Number.isInteger(seed)) throw new Error('Ziarno generatora musi być liczbą całkowitą.')
  const possible = vertices * (vertices - 1) / 2
  const desired = Math.max(vertices - 1, Math.round(possible * densityPercent / 100))
  const target = Math.min(possible, Math.max(vertices - 1, Math.min(edgeLimit, desired)))
  let state = seed >>> 0
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
  const adjacency: BenchGraph['adjacency'] = Array.from({ length: vertices }, () => [])
  const edges: BenchGraph['edges'] = []
  const seen = new Set<number>()
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const key = lo * vertices + hi
    if (lo === hi || seen.has(key)) return false
    seen.add(key)
    const weight = 1 + Math.floor(random() * 20)
    adjacency[a].push({ to: b, weight })
    adjacency[b].push({ to: a, weight })
    edges.push({ from: a, to: b, weight })
    return true
  }
  for (let v = 1; v < vertices; v++) add(Math.floor(random() * v), v)
  let attempts = 0
  const attemptLimit = Math.max(1000, target * 25)
  while (edges.length < target && attempts++ < attemptLimit) {
    add(Math.floor(random() * vertices), Math.floor(random() * vertices))
  }
  // Deterministic fallback guarantees exact edge count even near a complete graph.
  if (edges.length < target) {
    for (let a = 0; a < vertices && edges.length < target; a++) {
      for (let b = a + 1; b < vertices && edges.length < target; b++) add(a, b)
    }
  }
  return { adjacency, edges }
}

/** Protects the UI from quadratic/cubic workloads in current benchmark implementations. */
export function algorithmLimit(id: AlgorithmId, vertices: number, edges: number): string | null {
  if (id === 'dijkstra' && (vertices > 10000 || edges > 100000)) return 'Dijkstra: przekroczono limit 10 000 wierzchołków lub 100 000 krawędzi.'
  if (id === 'bellman' && (vertices > 1000 || edges > 25000)) return 'Bellman–Ford: maksymalnie 1000 wierzchołków i 25 000 krawędzi.'
  return null
}
