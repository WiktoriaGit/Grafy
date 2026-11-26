import { describe, expect, it } from 'vitest'
import {
  BATCH_MAX_SIZE,
  BATCH_PROBE_THRESHOLD_MS,
  METHODOLOGY_VERSION,
  fairRepetitionOrder,
  measure,
  measureAlgorithmsFair,
  resolveBatchSize,
  type BenchGraph,
} from './benchmark'
import { generateBenchmarkGraph } from './largeGraphs'

function tinyPath(): BenchGraph {
  return generateBenchmarkGraph({
    topology: 'path',
    vertices: 8,
    densityPercent: 0,
    seed: 7,
    weightMin: 1,
    weightMax: 3,
    directed: false,
  })
}

describe('M1 — sprawiedliwa kolejność', () => {
  it('przeplata A–B oraz B–A w kolejnych powtórzeniach', () => {
    expect(fairRepetitionOrder(['bfs', 'dfs'], 0)).toEqual(['bfs', 'dfs'])
    expect(fairRepetitionOrder(['bfs', 'dfs'], 1)).toEqual(['dfs', 'bfs'])
    expect(fairRepetitionOrder(['bfs', 'dfs'], 2)).toEqual(['bfs', 'dfs'])
  })

  it('rotuje trzy algorytmy cyklicznie', () => {
    expect(fairRepetitionOrder(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(fairRepetitionOrder(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a'])
    expect(fairRepetitionOrder(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b'])
  })

  it('measureAlgorithmsFair używa tego samego grafu i zachowuje liczbę powtórzeń', () => {
    const graph = tinyPath()
    const reps = 4
    const [bfs, dfs] = measureAlgorithmsFair(graph, ['bfs', 'dfs'], reps, {
      seed: 7,
      directed: false,
      topology: 'path',
    })
    expect(bfs.vertices).toBe(dfs.vertices)
    expect(bfs.edges).toBe(dfs.edges)
    expect(bfs.repetitions).toBe(reps)
    expect(dfs.repetitions).toBe(reps)
    expect(bfs.status).toBe('ran')
    expect(dfs.status).toBe('ran')
    expect(bfs.methodologyVersion).toBe(METHODOLOGY_VERSION)
    expect(dfs.methodologyVersion).toBe(METHODOLOGY_VERSION)
  })
})

describe('M2 — adaptive batching', () => {
  it('resolveBatchSize: poniżej progu → partia, powyżej → 1', () => {
    expect(resolveBatchSize(BATCH_PROBE_THRESHOLD_MS)).toBe(1)
    expect(resolveBatchSize(1)).toBe(1)
    expect(resolveBatchSize(0)).toBe(1)
    const batched = resolveBatchSize(0.05)
    expect(batched).toBeGreaterThan(1)
    expect(batched).toBeLessThanOrEqual(BATCH_MAX_SIZE)
  })

  it('measure zapisuje metadane trybu i wielkości partii; statystyki z n próbek', () => {
    const graph = tinyPath()
    const reps = 5
    const result = measure(graph, 'bfs', reps, { seed: 7, directed: false, topology: 'path' })
    expect(result.repetitions).toBe(reps)
    expect(result.methodologyVersion).toBe(METHODOLOGY_VERSION)
    expect(result.timingMode === 'single' || result.timingMode === 'batched').toBe(true)
    expect(typeof result.batchSize).toBe('number')
    expect(result.batchSize!).toBeGreaterThanOrEqual(1)
    expect(result.batchSize!).toBeLessThanOrEqual(BATCH_MAX_SIZE)
    // Populacyjne odchylenie standardowe — min ≤ mean ≤ max
    expect(result.min).toBeLessThanOrEqual(result.mean)
    expect(result.mean).toBeLessThanOrEqual(result.max)
    expect(result.stdDev).toBeGreaterThanOrEqual(0)
  })

  it('fair measurement także zapisuje timingMode/batchSize', () => {
    const graph = tinyPath()
    const [prim, kruskal] = measureAlgorithmsFair(graph, ['prim', 'kruskal'], 3, {
      directed: false,
      topology: 'path',
    })
    for (const r of [prim, kruskal]) {
      expect(r.methodologyVersion).toBe(METHODOLOGY_VERSION)
      expect(r.timingMode === 'single' || r.timingMode === 'batched').toBe(true)
      expect(r.batchSize).toBeGreaterThanOrEqual(1)
    }
  })
})
