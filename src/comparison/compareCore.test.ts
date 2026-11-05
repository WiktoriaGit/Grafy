import { describe, expect, it } from 'vitest'
import { fromEditor, runAlgorithm, type Graph } from '../algorithms/graphAlgorithms'
import {
  buildPairWarnings,
  categoryOf,
  fingerprintGraph,
  runComparison,
  sideStepCount,
  validateComparisonAlgorithm,
} from './compareCore'

const chain: Graph = {
  directed: true,
  vertices: ['A', 'B', 'C'],
  links: [
    { source: 'A', target: 'B', weight: 2 },
    { source: 'B', target: 'C', weight: 3 },
  ],
}

const undirected: Graph = {
  directed: false,
  vertices: ['A', 'B', 'C'],
  links: [
    { source: 'A', target: 'B', weight: 1 },
    { source: 'B', target: 'C', weight: 2 },
    { source: 'A', target: 'C', weight: 4 },
  ],
}

describe('Porównanie algorytmów — rdzeń', () => {
  it('oba algorytmy otrzymują identyczny fingerprint grafu', () => {
    const before = fingerprintGraph(chain)
    const comparison = runComparison(chain, 'bfs', 'dfs', 'A', 'C')
    expect(comparison.graphFingerprint).toBe(before)
    expect(fingerprintGraph(chain)).toBe(before)
    expect(comparison.left.metrics.vertices).toBe(comparison.right.metrics.vertices)
    expect(comparison.left.metrics.edges).toBe(comparison.right.metrics.edges)
  })

  it('liczniki kroków i operacji są dodatnie dla BFS vs DFS', () => {
    const comparison = runComparison(chain, 'bfs', 'dfs', 'A', 'C')
    expect(comparison.left.kind).toBe('path')
    expect(comparison.right.kind).toBe('path')
    expect(comparison.left.metrics.animationSteps).toBeGreaterThan(0)
    expect(comparison.right.metrics.animationSteps).toBeGreaterThan(0)
    expect(comparison.left.metrics.operations).toBeGreaterThan(0)
    expect(comparison.right.metrics.operations).toBeGreaterThan(0)
    expect(sideStepCount(comparison.left)).toBe(comparison.left.metrics.animationSteps)
    expect(sideStepCount(comparison.right)).toBe(comparison.right.metrics.animationSteps)
  })

  it('cofanie / przewijanie nie zmienia wyniku — wynik jest ustalony przed animacją', () => {
    const comparison = runComparison(chain, 'dijkstra', 'bellman', 'A', 'C')
    expect(comparison.left.kind).toBe('path')
    expect(comparison.right.kind).toBe('path')
    if (comparison.left.kind !== 'path' || comparison.right.kind !== 'path') return

    const leftPath = [...comparison.left.run.path]
    const rightPath = [...comparison.right.run.path]
    const leftDist = comparison.left.run.distances.C
    const rightDist = comparison.right.run.distances.C

    // Symulacja scrubbera: odczyt dowolnego kroku nie mutuje wyniku
    const midLeft = comparison.left.run.steps[Math.floor(comparison.left.run.steps.length / 2)]
    const midRight = comparison.right.run.steps[Math.floor(comparison.right.run.steps.length / 2)]
    expect(midLeft).toBeTruthy()
    expect(midRight).toBeTruthy()
    expect(comparison.left.run.path).toEqual(leftPath)
    expect(comparison.right.run.path).toEqual(rightPath)
    expect(comparison.left.run.distances.C).toBe(leftDist)
    expect(comparison.right.run.distances.C).toBe(rightDist)
    expect(leftDist).toBe(5)
    expect(rightDist).toBe(5)
  })

  it('porównanie nie mutuje grafu wejściowego (kopia lokalna)', () => {
    const original = structuredClone(chain)
    runComparison(chain, 'bfs', 'dijkstra', 'A', 'C')
    expect(chain).toEqual(original)
  })

  it('walidacja blokuje Dijkstrę przy ujemnych wagach w porównaniu', () => {
    const negative = fromEditor({
      directed: true,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ source: 'A', target: 'B', weight: -1 }],
    })
    const validation = validateComparisonAlgorithm(negative, 'dijkstra', 'A', 'B')
    expect(validation.ok).toBe(false)
    expect(() => runComparison(negative, 'dijkstra', 'bellman', 'A', 'B')).toThrow(/ujemnych wag/i)
  })

  it('walidacja blokuje MST na grafie skierowanym', () => {
    const validation = validateComparisonAlgorithm(chain, 'prim', 'A')
    expect(validation.ok).toBe(false)
    expect(() => runComparison(chain, 'prim', 'kruskal', 'A', 'C')).toThrow(/nieskierowanego/i)
  })

  it('Prim vs Kruskal na nieskierowanym grafie daje tę samą wagę MST', () => {
    const comparison = runComparison(undirected, 'prim', 'kruskal', 'A', 'C')
    expect(comparison.left.kind).toBe('mst')
    expect(comparison.right.kind).toBe('mst')
    if (comparison.left.kind !== 'mst' || comparison.right.kind !== 'mst') return
    expect(comparison.left.result.totalWeight).toBe(comparison.right.result.totalWeight)
    expect(comparison.left.result.totalWeight).toBe(3)
  })

  it('ostrzega, że BFS/DFS nie są równoważne Dijkstrze dla ścieżek ważonych', () => {
    const warnings = buildPairWarnings('bfs', 'dijkstra')
    expect(warnings.some(w => /BFS\/DFS/i.test(w.title) || /nie są równoważne/i.test(w.message))).toBe(true)
    expect(categoryOf('bfs')).toBe('search')
    expect(categoryOf('dijkstra')).toBe('shortest')
  })

  it('pojedyncze uruchomienie BFS i DFS zwraca różne kolejności na typowym grafie', () => {
    const branched: Graph = {
      directed: false,
      vertices: ['A', 'B', 'C', 'D'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'A', target: 'C', weight: 1 },
        { source: 'B', target: 'D', weight: 1 },
        { source: 'C', target: 'D', weight: 1 },
      ],
    }
    const bfs = runAlgorithm(branched, 'bfs', 'A', 'D')
    const dfs = runAlgorithm(branched, 'dfs', 'A', 'D')
    expect(bfs.order.join('|')).not.toBe(dfs.order.join('|'))
    const comparison = runComparison(branched, 'bfs', 'dfs', 'A', 'D')
    expect(comparison.left.metrics.durationMs).toBeGreaterThanOrEqual(0)
    expect(comparison.right.metrics.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('Porównanie a workspace edytora', () => {
  it('runComparison nie zapisuje nic do localStorage (gdy dostępny)', () => {
    const storage = globalThis.localStorage
    if (!storage) {
      // Środowisko testowe bez DOM — sam rdzeń i tak nie dotyka storage.
      const before = fingerprintGraph(chain)
      runComparison(chain, 'bfs', 'dfs', 'A', 'C')
      expect(fingerprintGraph(chain)).toBe(before)
      return
    }
    const key = 'graphlab-editor-v1'
    const previous = storage.getItem(key)
    try {
      storage.setItem(key, JSON.stringify({
        version: 1,
        directed: true,
        nodes: [{ id: 'X', position: { x: 1, y: 2 } }],
        edges: [],
      }))
      const before = storage.getItem(key)
      runComparison(chain, 'bfs', 'dfs', 'A', 'C')
      expect(storage.getItem(key)).toBe(before)
    } finally {
      if (previous == null) storage.removeItem(key)
      else storage.setItem(key, previous)
    }
  })
})
