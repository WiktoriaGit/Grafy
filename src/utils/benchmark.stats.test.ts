import { describe, expect, it } from 'vitest'
import {
  computeTimeStats,
  graphDensityPercent,
  measure,
  runBenchmarkAlgorithm,
  type BenchGraph,
} from './benchmark'
import { generateBenchmarkGraph } from './largeGraphs'

describe('Statystyki benchmarku', () => {
  it('liczy średnią, medianę, min, max i odchylenie', () => {
    const stats = computeTimeStats([10, 20, 30, 40])
    expect(stats.mean).toBe(25)
    expect(stats.median).toBe(25)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(40)
    expect(stats.stdDev).toBeCloseTo(Math.sqrt(125), 8)
  })

  it('odrzuca nieprawidłowe próbki', () => {
    expect(() => computeTimeStats([])).toThrow()
    expect(() => computeTimeStats([1, Number.NaN])).toThrow()
  })

  it('measure oddziela metryki algorytmu od czasu generowania', () => {
    const graph = generateBenchmarkGraph({
      topology: 'path',
      vertices: 80,
      densityPercent: 0,
      seed: 7,
      weightMin: 1,
      weightMax: 4,
      directed: false,
    })
    const result = measure(graph, 'bfs', 5, {
      generateMs: 12.5,
      seed: 7,
      directed: false,
      topology: 'path',
      weightMin: 1,
      weightMax: 4,
    })
    expect(result.generateMs).toBe(12.5)
    expect(result.repetitions).toBe(5)
    expect(result.mean).toBeGreaterThanOrEqual(0)
    expect(result.median).toBeGreaterThanOrEqual(0)
    expect(result.stdDev).toBeGreaterThanOrEqual(0)
    expect(result.min).toBeLessThanOrEqual(result.mean)
    expect(result.max).toBeGreaterThanOrEqual(result.mean)
    expect(result.topology).toBe('path')
    expect(result.vertices).toBe(80)
  })

  it('identyczny graf daje powtarzalne operacje BFS', () => {
    const graph: BenchGraph = generateBenchmarkGraph({
      topology: 'cycle',
      vertices: 30,
      densityPercent: 0,
      seed: 11,
      weightMin: 1,
      weightMax: 1,
      directed: false,
    })
    const a = runBenchmarkAlgorithm(graph, 'bfs')
    const b = runBenchmarkAlgorithm(graph, 'bfs')
    expect(a.operations).toBe(b.operations)
    expect(a.reached).toBe(true)
  })

  it('gestosc jest spójna z V/E', () => {
    expect(graphDensityPercent(5, 10, false)).toBe(100)
    expect(graphDensityPercent(5, 5, true)).toBe(25)
  })
})
