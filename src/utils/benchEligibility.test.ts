import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmEligibility,
  inspectBenchGraph,
  preflightAlgorithms,
} from './benchEligibility'
import { workspaceToBenchGraph, type BenchGraph } from './benchmark'
import type { WorkspaceGraph } from '../workspace/graphWorkspace'

function undirectedPositive(): BenchGraph {
  return workspaceToBenchGraph({
    version: 1,
    directed: false,
    nodes: [
      { id: 'A', position: { x: 0, y: 0 } },
      { id: 'B', position: { x: 1, y: 0 } },
      { id: 'C', position: { x: 0, y: 1 } },
    ],
    edges: [
      { source: 'A', target: 'B', weight: 1 },
      { source: 'B', target: 'C', weight: 2 },
      { source: 'A', target: 'C', weight: 4 },
    ],
  })
}

describe('Walidacja gotowości algorytmów benchmarku', () => {
  it('pomija Prim/Kruskal na grafie skierowanym z konkretnym powodem', () => {
    const directed: WorkspaceGraph = {
      version: 1,
      directed: true,
      nodes: [
        { id: 'A', position: { x: 0, y: 0 } },
        { id: 'B', position: { x: 1, y: 0 } },
      ],
      edges: [{ source: 'A', target: 'B', weight: 1 }],
    }
    const graph = workspaceToBenchGraph(directed)
    const facts = inspectBenchGraph(graph, true)
    expect(evaluateAlgorithmEligibility('prim', facts).ok).toBe(false)
    expect(evaluateAlgorithmEligibility('kruskal', facts).ok).toBe(false)
    const prim = evaluateAlgorithmEligibility('prim', facts)
    if (prim.ok) throw new Error('expected skip')
    expect(prim.reason).toMatch(/nieskierowanego/i)
  })

  it('pomija Dijkstrę przy ujemnej wadze', () => {
    const graph = workspaceToBenchGraph({
      version: 1,
      directed: true,
      nodes: [
        { id: 'A', position: { x: 0, y: 0 } },
        { id: 'B', position: { x: 1, y: 0 } },
      ],
      edges: [{ source: 'A', target: 'B', weight: -2 }],
    })
    const facts = inspectBenchGraph(graph, true)
    expect(facts.hasNegativeWeight).toBe(true)
    const dijkstra = evaluateAlgorithmEligibility('dijkstra', facts)
    expect(dijkstra.ok).toBe(false)
    if (!dijkstra.ok) expect(dijkstra.reason).toMatch(/ujemnych/i)
    expect(evaluateAlgorithmEligibility('bellman', facts).ok).toBe(true)
  })

  it('na nieskierowanym nieujemnym grafie wszystkie sześć metod są gotowe', () => {
    const graph = undirectedPositive()
    const facts = inspectBenchGraph(graph, false)
    const rows = preflightAlgorithms(
      ['bfs', 'dfs', 'dijkstra', 'bellman', 'prim', 'kruskal'],
      facts,
    )
    expect(rows.every(r => r.eligibility.ok)).toBe(true)
  })

  it('oznacza ujemną krawędź nieskierowaną jako ryzyko cyklu dla najkrótszych ścieżek', () => {
    const graph = workspaceToBenchGraph({
      version: 1,
      directed: false,
      nodes: [
        { id: 'A', position: { x: 0, y: 0 } },
        { id: 'B', position: { x: 1, y: 0 } },
      ],
      edges: [{ source: 'A', target: 'B', weight: -1 }],
    })
    const facts = inspectBenchGraph(graph, false)
    expect(facts.undirectedNegativeImpliesCycle).toBe(true)
  })
})
