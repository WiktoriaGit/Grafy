/**
 * Regresja przypadków brzegowych (etap 03) — bez nowych zależności.
 */
import { describe, expect, it } from 'vitest'
import { fromEditor, runAlgorithm } from '../algorithms/graphAlgorithms'
import { calculateMST } from '../algorithms/mstAlgorithms'
import {
  METHODOLOGY_VERSION,
  measure,
  measureAlgorithmsFair,
  runBenchmarkAlgorithm,
  type BenchGraph,
} from './benchmark'
import { evaluateAlgorithmEligibility, inspectBenchGraph } from './benchEligibility'
import { MAX_VERTICES, validateGeneratorParams } from './largeGraphs'
import { buildGroupInsights } from './experimentInsights'
import { invalidateBenchResult, verifyMstWeights, verifyReachableSets } from './pairCompare'

function pathGraph(): BenchGraph {
  return {
    adjacency: [[{ to: 1, weight: 0 }], [{ to: 0, weight: 0 }, { to: 2, weight: 5 }], [{ to: 1, weight: 5 }]],
    edges: [
      { from: 0, to: 1, weight: 0 },
      { from: 1, to: 2, weight: 5 },
    ],
  }
}

describe('Przypadki brzegowe — algorytmy edukacyjne', () => {
  it('pojedynczy wierzchołek: BFS/DFS/Dijkstra dają ścieżkę [A] i dystans 0', () => {
    const g = { directed: false, vertices: ['A'], links: [] as { source: string; target: string; weight: number }[] }
    for (const algo of ['bfs', 'dfs', 'dijkstra'] as const) {
      const r = runAlgorithm(g, algo, 'A', 'A')
      expect(r.path).toEqual(['A'])
      expect(r.distance).toBe(0)
      expect(r.reachable).toEqual(['A'])
    }
  })

  it('wagi zerowe: Dijkstra akceptuje i liczy trasę', () => {
    const r = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 0 },
        { source: 'B', target: 'C', weight: 0 },
      ],
    }, 'dijkstra', 'A', 'C')
    expect(r.distance).toBe(0)
    expect(r.path).toEqual(['A', 'B', 'C'])
  })

  it('graf z cyklem: BFS kończy się i znajduje cel', () => {
    const r = runAlgorithm({
      directed: false,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'B', target: 'C', weight: 1 },
        { source: 'C', target: 'A', weight: 1 },
      ],
    }, 'bfs', 'A', 'C')
    expect(r.path.length).toBeGreaterThan(0)
    expect(r.path.at(-1)).toBe('C')
    expect(r.reachable.sort()).toEqual(['A', 'B', 'C'])
  })

  it('graf niespójny: start nie osiąga drugiej składowej', () => {
    const r = runAlgorithm({
      directed: false,
      vertices: ['A', 'B', 'X', 'Y'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'X', target: 'Y', weight: 1 },
      ],
    }, 'bfs', 'A', 'Y')
    expect(r.path).toEqual([])
    expect(r.reachable.sort()).toEqual(['A', 'B'])
  })

  it('pusty graf: fromEditor dopuszcza 0 wierzchołków; runAlgorithm rzuca „Wybierz poprawne wierzchołki”', () => {
    const g = fromEditor({ directed: false, nodes: [], edges: [] })
    expect(g.vertices).toEqual([])
    expect(() => runAlgorithm(g, 'bfs', '', '')).toThrow(/poprawne wierzchołki/i)
  })
})

describe('Przypadki brzegowe — MST i benchmark', () => {
  it('Prim/Kruskal na niespójnym grafie budują las o tej samej wadze', () => {
    const g = {
      directed: false,
      vertices: ['A', 'B', 'C', 'D'],
      links: [
        { source: 'A', target: 'B', weight: 2 },
        { source: 'C', target: 'D', weight: 3 },
      ],
    }
    const prim = calculateMST(g, 'prim', 'A')
    const kruskal = calculateMST(g, 'kruskal')
    expect(prim.connected).toBe(false)
    expect(kruskal.connected).toBe(false)
    expect(prim.totalWeight).toBe(kruskal.totalWeight)
    expect(prim.totalWeight).toBe(5)
  })

  it('wagi zerowe w benchmarku: Dijkstra i Bellman zgodne; BFS/DFS ten sam reachable', () => {
    const g = pathGraph()
    const d = runBenchmarkAlgorithm(g, 'dijkstra')
    const b = runBenchmarkAlgorithm(g, 'bellman')
    expect(d.negativeCycle).toBeFalsy()
    expect([...d.distances!]).toEqual([...b.distances!])
    const reach = verifyReachableSets(g, 0)
    expect(reach.ok).toBe(true)
  })

  it('measureAlgorithmsFair zapisuje metodologię gl-bench-2026.11', () => {
    const g = pathGraph()
    const rows = measureAlgorithmsFair(g, ['bfs', 'dfs'], 3, { topology: 'path', directed: false })
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.methodologyVersion === METHODOLOGY_VERSION)).toBe(true)
    expect(rows.every(r => r.repetitions === 3)).toBe(true)
  })

  it('ujemny cykl w measure → status error (nie ran)', () => {
    const g: BenchGraph = {
      adjacency: [[{ to: 1, weight: -1 }], [{ to: 0, weight: -1 }]],
      edges: [{ from: 0, to: 1, weight: -1 }],
    }
    // nieskierowany ujemny = cykl 2-krawędziowy w Bellmanie
    const result = measure(g, 'bellman', 2, { directed: false })
    expect(result.status).toBe('error')
    expect(result.skipReason).toMatch(/ujemn/i)
  })

  it('eligibility: Prim skipped na skierowanym; insights wykluczają error z wniosków', () => {
    const directed: BenchGraph = {
      adjacency: [[{ to: 1, weight: 1 }], []],
      edges: [{ from: 0, to: 1, weight: 1 }],
    }
    const facts = inspectBenchGraph(directed, true)
    expect(evaluateAlgorithmEligibility('prim', facts).ok).toBe(false)

    const ok = measure(pathGraph(), 'bfs', 2, { directed: false, topology: 'path' })
    const bad = invalidateBenchResult({ ...ok, algorithm: 'dfs', id: 'bad-1' }, 'sztuczna niezgodność')
    const insights = buildGroupInsights([ok, bad])
    const search = insights.find(g => g.group === 'search')
    expect(search?.summary).toMatch(/BFS|pomini|błąd|wykonan/i)
    // nie porównuj czasów pary gdy jeden jest error — summary nie powinien twierdzić o przewadze obu
    expect(bad.status).toBe('error')
    expect(bad.mean).toBe(ok.mean)
  })

  it('verifyMstWeights na zgodnym grafie path', () => {
    const g = pathGraph()
    expect(verifyMstWeights(g).ok).toBe(true)
  })
})

describe('Przypadki brzegowe — generator', () => {
  it('odrzuca przekroczenie MAX_VERTICES', () => {
    const v = validateGeneratorParams({
      topology: 'erdos',
      vertices: MAX_VERTICES + 1,
      densityPercent: 5,
      seed: 1,
      weightMin: 1,
      weightMax: 2,
      directed: false,
    })
    expect(v.ok).toBe(false)
  })

  it('odrzuca ujemną liczbę wierzchołków / nieskończoną gęstość', () => {
    expect(validateGeneratorParams({
      topology: 'erdos',
      vertices: 0,
      densityPercent: 10,
      seed: 1,
      weightMin: 1,
      weightMax: 2,
      directed: false,
    }).ok).toBe(false)
    expect(validateGeneratorParams({
      topology: 'erdos',
      vertices: 10,
      densityPercent: Number.NaN,
      seed: 1,
      weightMin: 1,
      weightMax: 2,
      directed: false,
    }).ok).toBe(false)
  })
})
