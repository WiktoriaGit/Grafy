import { describe, expect, it } from 'vitest'
import {
  measure,
  runBenchmarkAlgorithm,
  type BenchGraph,
} from './benchmark'
import { generateBenchmarkGraph } from './largeGraphs'

/** Directed path A→B→C as indices 0→1→2. */
function directedPathABC(): BenchGraph {
  return {
    adjacency: [
      [{ to: 1, weight: 2 }],
      [{ to: 2, weight: 3 }],
      [],
    ],
    edges: [
      { from: 0, to: 1, weight: 2 },
      { from: 1, to: 2, weight: 3 },
    ],
  }
}

/** Undirected path A—B—C (both directions in adjacency, edges stored once). */
function undirectedPathABC(): BenchGraph {
  return {
    adjacency: [
      [{ to: 1, weight: 2 }],
      [{ to: 0, weight: 2 }, { to: 2, weight: 3 }],
      [{ to: 1, weight: 3 }],
    ],
    edges: [
      { from: 0, to: 1, weight: 2 },
      { from: 1, to: 2, weight: 3 },
    ],
  }
}

describe('Bellman–Ford w benchmarku — kierunki krawędzi', () => {
  it('na grafie skierowanym A→B→C nie relaksuje wstecz (C nie osiąga A)', () => {
    const graph = directedPathABC()
    const fromA = runBenchmarkAlgorithm(graph, 'bellman', { source: 0 })
    expect([...fromA.distances!]).toEqual([0, 2, 5])

    const fromC = runBenchmarkAlgorithm(graph, 'bellman', { source: 2 })
    expect(fromC.distances![2]).toBe(0)
    expect(fromC.distances![1]).toBe(Infinity)
    expect(fromC.distances![0]).toBe(Infinity)
    // `reached` = czy wierzchołek n−1 jest osiągalny; tu źródło = n−1, więc true, mimo braku wstecz
    expect(fromC.reached).toBe(true)
  })

  it('na grafie nieskierowanym A—B—C obsługuje oba kierunki', () => {
    const graph = undirectedPathABC()
    const fromC = runBenchmarkAlgorithm(graph, 'bellman', { source: 2 })
    expect([...fromC.distances!]).toEqual([5, 3, 0])
    expect(fromC.reached).toBe(true)

    const fromA = runBenchmarkAlgorithm(graph, 'bellman', { source: 0 })
    expect([...fromA.distances!]).toEqual([0, 2, 5])
  })

  it('nie wytwarza łuku wstecz na pojedynczej krawędzi skierowanej', () => {
    const graph: BenchGraph = {
      adjacency: [[{ to: 1, weight: 4 }], []],
      edges: [{ from: 0, to: 1, weight: 4 }],
    }
    const fromTarget = runBenchmarkAlgorithm(graph, 'bellman', { source: 1 })
    expect(fromTarget.distances![0]).toBe(Infinity)
    expect(fromTarget.distances![1]).toBe(0)
  })
})

describe('BFS/DFS w benchmarku — pełna eksploracja', () => {
  it('BFS odwiedza całą osiągalną część (bez early-exit na n−1)', () => {
    // 0 → 2 (target) oraz 0 → 1 → 3; early-exit na 2 pominąłby 1 i 3
    const graph: BenchGraph = {
      adjacency: [
        [{ to: 2, weight: 1 }, { to: 1, weight: 1 }],
        [{ to: 3, weight: 1 }],
        [],
        [],
      ],
      edges: [
        { from: 0, to: 2, weight: 1 },
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 3, weight: 1 },
      ],
    }
    const result = runBenchmarkAlgorithm(graph, 'bfs')
    expect(result.visitedCount).toBe(4)
    expect(result.reached).toBe(true)
    // Przy early-exit po pierwszym wyjęciu 2 operacje byłyby mniejsze — tu przeglądamy wszystkie łuki
    expect(result.operations).toBe(3)
  })

  it('DFS odwiedza całą osiągalną część grafu niespójnego tylko ze źródła', () => {
    const graph: BenchGraph = {
      adjacency: [
        [{ to: 1, weight: 1 }],
        [],
        [{ to: 3, weight: 1 }],
        [],
      ],
      edges: [
        { from: 0, to: 1, weight: 1 },
        { from: 2, to: 3, weight: 1 },
      ],
    }
    const result = runBenchmarkAlgorithm(graph, 'dfs', { source: 0 })
    expect(result.visitedCount).toBe(2)
    expect(result.reached).toBe(false)
  })

  it('BFS i DFS mają ten sam visitedCount na spójnym grafie nieskierowanym', () => {
    const graph = undirectedPathABC()
    const bfs = runBenchmarkAlgorithm(graph, 'bfs')
    const dfs = runBenchmarkAlgorithm(graph, 'dfs')
    expect(bfs.visitedCount).toBe(3)
    expect(dfs.visitedCount).toBe(3)
  })
})

describe('Metodologia pomiaru', () => {
  it('measure nie wlicza czasu generowania i nie tworzy kroków animacji', () => {
    const graph = generateBenchmarkGraph({
      topology: 'path',
      vertices: 40,
      densityPercent: 0,
      seed: 99,
      weightMin: 1,
      weightMax: 5,
      directed: false,
    })
    const result = measure(graph, 'bfs', 3, { generateMs: 42, seed: 99, directed: false, topology: 'path' })
    expect(result.generateMs).toBe(42)
    expect(result.mean).toBeGreaterThanOrEqual(0)
    // Lean runner returns only counters — no steps field on BenchmarkRunResult
    const once = runBenchmarkAlgorithm(graph, 'bfs')
    expect('steps' in once).toBe(false)
    expect(once.visitedCount).toBe(40)
  })

  it('Bellman na skierowanej ścieżce z generatora nie osiąga wstecz', () => {
    const graph = generateBenchmarkGraph({
      topology: 'path',
      vertices: 5,
      densityPercent: 0,
      seed: 1,
      weightMin: 1,
      weightMax: 1,
      directed: true,
    })
    const fromEnd = runBenchmarkAlgorithm(graph, 'bellman', { source: 4 })
    expect(fromEnd.distances![0]).toBe(Infinity)
    expect(fromEnd.distances![4]).toBe(0)
  })
})
