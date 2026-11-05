import { describe, expect, it } from 'vitest'
import {
  buildPairComparison,
  methodologyWarnings,
  percentFaster,
  sameBenchmarkInput,
  verifyNonNegativeShortestPaths,
} from './pairCompare'
import type { BenchResult } from './benchmark'
import { generateBenchmarkGraph } from './largeGraphs'

function fakeResult(partial: Partial<BenchResult> & Pick<BenchResult, 'algorithm' | 'mean'>): BenchResult {
  return {
    id: partial.id ?? `${partial.algorithm}-id`,
    algorithm: partial.algorithm,
    vertices: partial.vertices ?? 100,
    edges: partial.edges ?? 99,
    density: partial.density ?? 2,
    repetitions: partial.repetitions ?? 5,
    mean: partial.mean,
    median: partial.median ?? partial.mean,
    stdDev: partial.stdDev ?? 0.1,
    min: partial.min ?? partial.mean,
    max: partial.max ?? partial.mean,
    operations: partial.operations ?? 10,
    reached: true,
    timestamp: new Date().toISOString(),
    generateMs: partial.generateMs ?? 1,
    seed: partial.seed ?? 1,
    directed: partial.directed ?? false,
    topology: partial.topology ?? 'path',
    weightMin: partial.weightMin ?? 1,
    weightMax: partial.weightMax ?? 5,
  }
}

describe('Porównanie pary pomiarów', () => {
  it('liczy różnicę czasu i procent względem wolniejszego', () => {
    expect(percentFaster(8, 10)).toBeCloseTo(20, 8)
    expect(percentFaster(10, 0)).toBeNull()
  })

  it('buduje wnioski bez nazywania „najlepszego” uniwersalnie', () => {
    const left = fakeResult({ algorithm: 'dijkstra', mean: 2 })
    const right = fakeResult({ algorithm: 'bellman', mean: 5 })
    const pair = buildPairComparison(left, right)
    expect(pair.fasterId).toBe('dijkstra')
    expect(pair.diffMs).toBeCloseTo(3, 8)
    expect(pair.diffPercent).toBeCloseTo(60, 8)
    expect(pair.sameInput).toBe(true)
    expect(pair.conclusions.some(c => /szybszy był Dijkstra/i.test(c))).toBe(true)
    expect(pair.conclusions.some(c => /≠ „lepszy uniwersalnie”/i.test(c))).toBe(true)
  })

  it('oznacza różne wejścia jako nieporównywalne czasowo', () => {
    const left = fakeResult({ algorithm: 'bfs', mean: 1, vertices: 100 })
    const right = fakeResult({ algorithm: 'dfs', mean: 2, vertices: 1000 })
    expect(sameBenchmarkInput(left, right)).toBe(false)
    const pair = buildPairComparison(left, right)
    expect(pair.warnings.some(w => /różnych parametrach wejścia/i.test(w))).toBe(true)
  })

  it('ostrzega, że DFS nie jest najkrótszą drogą', () => {
    const notes = methodologyWarnings('bfs', 'dfs')
    expect(notes.some(n => /nie jako algorytmy najkrótszej drogi ważonej/i.test(n))).toBe(true)
    const withShortest = methodologyWarnings('dfs', 'dijkstra')
    expect(withShortest.some(n => /nie jest algorytmem najkrótszej drogi/i.test(n))).toBe(true)
  })

  it('ostrzega, że przy ujemnych wagach Dijkstry nie uruchamiamy jako poprawnej metody', () => {
    const notes = methodologyWarnings('dijkstra', 'bellman')
    expect(notes.some(n => /ujemnych wagach Dijkstry nie uruchamiamy/i.test(n))).toBe(true)
  })

  it('Dijkstra i Bellman–Ford dają zgodne odległości na grafie nieujemnym', () => {
    const graph = generateBenchmarkGraph({
      topology: 'erdos',
      vertices: 40,
      densityPercent: 8,
      seed: 42,
      weightMin: 1,
      weightMax: 9,
      directed: true,
    })
    const agreement = verifyNonNegativeShortestPaths(graph, 0)
    expect(agreement.ok).toBe(true)
    expect(agreement.mismatches).toBe(0)
    expect(agreement.checked).toBe(40)
  })

  it('dwa pomiary z tej samej serii mają identyczne parametry wejścia', () => {
    const a = fakeResult({ algorithm: 'bfs', mean: 1, seed: 7, vertices: 1000, edges: 999 })
    const b = fakeResult({ algorithm: 'dfs', mean: 1.2, seed: 7, vertices: 1000, edges: 999 })
    expect(sameBenchmarkInput(a, b)).toBe(true)
  })
})
