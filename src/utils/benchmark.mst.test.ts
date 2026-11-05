import { describe, expect, it } from 'vitest'
import {
  kruskalUnionFind,
  measure,
  primHeap,
  runBenchmarkAlgorithm,
  workspaceToBenchGraph,
} from './benchmark'
import { inspectBenchGraph, preflightAlgorithms } from './benchEligibility'
import { buildGroupInsights } from './experimentInsights'

describe('Benchmark MST i wspólne wejście', () => {
  const undirected = workspaceToBenchGraph({
    version: 1,
    directed: false,
    nodes: [
      { id: 'A', position: { x: 0, y: 0 } },
      { id: 'B', position: { x: 1, y: 0 } },
      { id: 'C', position: { x: 0, y: 1 } },
      { id: 'D', position: { x: 1, y: 1 } },
    ],
    edges: [
      { source: 'A', target: 'B', weight: 1 },
      { source: 'A', target: 'C', weight: 4 },
      { source: 'B', target: 'C', weight: 2 },
      { source: 'B', target: 'D', weight: 5 },
      { source: 'C', target: 'D', weight: 3 },
    ],
  })

  it('Prim i Kruskal dają tę samą wagę MST na wspólnym grafie', () => {
    const prim = primHeap(undirected, 0)
    const kruskal = kruskalUnionFind(undirected)
    expect(prim.mstWeight).toBe(6) // 1+2+3
    expect(kruskal.mstWeight).toBe(6)
    expect(prim.edgesUsed).toBe(3)
    expect(kruskal.edgesUsed).toBe(3)
  })

  it('measure zwraca status ran i te same parametry wejścia dla pary MST', () => {
    const a = measure(undirected, 'prim', 3, {
      directed: false,
      topology: 'custom',
      seed: 1,
      weightMin: 1,
      weightMax: 5,
      runId: 't1',
      sourceLabel: 'test',
    })
    const b = measure(undirected, 'kruskal', 3, {
      directed: false,
      topology: 'custom',
      seed: 1,
      weightMin: 1,
      weightMax: 5,
      runId: 't1',
      sourceLabel: 'test',
    })
    expect(a.status).toBe('ran')
    expect(b.status).toBe('ran')
    expect(a.vertices).toBe(b.vertices)
    expect(a.edges).toBe(b.edges)
    expect(a.runId).toBe(b.runId)
  })

  it('Bellman zgłasza ujemny cykl na nieskierowanej ujemnej krawędzi', () => {
    const g = workspaceToBenchGraph({
      version: 1,
      directed: false,
      nodes: [
        { id: 'A', position: { x: 0, y: 0 } },
        { id: 'B', position: { x: 1, y: 0 } },
      ],
      edges: [{ source: 'A', target: 'B', weight: -3 }],
    })
    const result = runBenchmarkAlgorithm(g, 'bellman')
    expect(result.negativeCycle).toBe(true)
    const measured = measure(g, 'bellman', 2, { directed: false, topology: 'custom' })
    expect(measured.status).toBe('error')
    expect(measured.skipReason).toMatch(/ujemny cykl/i)
  })

  it('wnioski grupują wyniki i respektują pominięcia', () => {
    const facts = inspectBenchGraph(undirected, false)
    const ready = preflightAlgorithms(['bfs', 'prim', 'dijkstra'], facts)
    expect(ready.every(r => r.eligibility.ok)).toBe(true)

    const directedSkip = preflightAlgorithms(['prim'], {
      ...facts,
      directed: true,
    })
    expect(directedSkip[0].eligibility.ok).toBe(false)

    const insights = buildGroupInsights([
      measure(undirected, 'bfs', 2, { directed: false, topology: 'custom', runId: 'x' }),
      measure(undirected, 'dfs', 2, { directed: false, topology: 'custom', runId: 'x' }),
      {
        ...measure(undirected, 'prim', 2, { directed: false, topology: 'custom', runId: 'x' }),
        status: 'skipped',
        skipReason: 'test skip',
        mean: 0,
      },
    ])
    const search = insights.find(g => g.group === 'search')
    expect(search?.ran.length).toBe(2)
    expect(search?.fasterId).not.toBeNull()
    const mst = insights.find(g => g.group === 'mst')
    expect(mst?.skipped.length).toBe(1)
  })
})
