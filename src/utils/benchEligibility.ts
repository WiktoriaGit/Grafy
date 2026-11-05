import type { AlgorithmId, BenchGraph } from './benchmark'
import { algorithmLimit, algorithmWeightLimit } from './largeGraphs'

export type AlgorithmProblemGroup = 'search' | 'shortest' | 'mst'

export const ALGORITHM_PROBLEM_GROUP: Record<AlgorithmId, AlgorithmProblemGroup> = {
  bfs: 'search',
  dfs: 'search',
  dijkstra: 'shortest',
  bellman: 'shortest',
  prim: 'mst',
  kruskal: 'mst',
}

export const PROBLEM_GROUP_LABELS: Record<AlgorithmProblemGroup, string> = {
  search: 'Przeszukiwanie grafu',
  shortest: 'Najkrótsze ścieżki od źródła',
  mst: 'Minimalne drzewo / las rozpinający',
}

export const ALL_BENCHMARK_ALGORITHMS: AlgorithmId[] = [
  'bfs',
  'dfs',
  'dijkstra',
  'bellman',
  'prim',
  'kruskal',
]

export type GraphFacts = {
  vertices: number
  edges: number
  directed: boolean
  weightMin: number
  weightMax: number
  hasNegativeWeight: boolean
  /** Undirected graph with a negative edge implies a 2-cycle in the shortest-path sense. */
  undirectedNegativeImpliesCycle: boolean
}

export type Eligibility =
  | { ok: true; group: AlgorithmProblemGroup }
  | { ok: false; group: AlgorithmProblemGroup; reason: string }

export function inspectBenchGraph(graph: BenchGraph, directed: boolean): GraphFacts {
  let weightMin = Infinity
  let weightMax = -Infinity
  let hasNegativeWeight = false
  for (const edge of graph.edges) {
    if (!Number.isFinite(edge.weight)) continue
    weightMin = Math.min(weightMin, edge.weight)
    weightMax = Math.max(weightMax, edge.weight)
    if (edge.weight < 0) hasNegativeWeight = true
  }
  if (!Number.isFinite(weightMin)) {
    weightMin = 0
    weightMax = 0
  }
  return {
    vertices: graph.adjacency.length,
    edges: graph.edges.length,
    directed,
    weightMin,
    weightMax,
    hasNegativeWeight,
    undirectedNegativeImpliesCycle: !directed && hasNegativeWeight,
  }
}

export function evaluateAlgorithmEligibility(id: AlgorithmId, facts: GraphFacts): Eligibility {
  const group = ALGORITHM_PROBLEM_GROUP[id]

  if (facts.vertices < 1) {
    return { ok: false, group, reason: 'Graf nie zawiera wierzchołków.' }
  }

  const sizeLimit = algorithmLimit(id, facts.vertices, facts.edges)
  if (sizeLimit) return { ok: false, group, reason: sizeLimit }

  const weightLimit = algorithmWeightLimit(id, facts.weightMin)
  if (weightLimit) return { ok: false, group, reason: weightLimit }

  if ((id === 'prim' || id === 'kruskal') && facts.directed) {
    return {
      ok: false,
      group,
      reason: 'Prim/Kruskal wymagają grafu nieskierowanego — graf skierowany został pominięty.',
    }
  }

  if (id === 'dijkstra' && facts.hasNegativeWeight) {
    return {
      ok: false,
      group,
      reason: 'Dijkstra nie jest poprawną metodą przy ujemnych wagach — algorytm pominięty.',
    }
  }

  if (id === 'bellman' && facts.undirectedNegativeImpliesCycle) {
    // Still runnable, but Experiments should treat a detected cycle as an error result.
    // Preflight stays ok:true with an informational note handled by UI warnings.
  }

  return { ok: true, group }
}

export function preflightAlgorithms(
  selected: AlgorithmId[],
  facts: GraphFacts,
): Array<{ id: AlgorithmId; eligibility: Eligibility }> {
  return selected.map(id => ({ id, eligibility: evaluateAlgorithmEligibility(id, facts) }))
}
