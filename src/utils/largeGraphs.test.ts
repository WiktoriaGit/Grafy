import { describe, expect, it } from 'vitest'
import {
  algorithmLimit,
  estimateEdgeCount,
  generateBenchmarkGraph,
  generateLargeGraph,
  validateGeneratorParams,
} from './largeGraphs'

describe('Generator dużych grafów', () => {
  it('generuje spójny graf rzadki 10 000 wierzchołków', () => {
    const g = generateLargeGraph(10000, 0.01, 42)
    expect(g.adjacency).toHaveLength(10000)
    expect(g.edges.length).toBeGreaterThanOrEqual(9999)
    const seen = new Uint8Array(10000)
    const queue = [0]
    seen[0] = 1
    for (let head = 0; head < queue.length; head++) {
      for (const e of g.adjacency[queue[head]]) {
        if (!seen[e.to]) {
          seen[e.to] = 1
          queue.push(e.to)
        }
      }
    }
    expect(queue).toHaveLength(10000)
  })

  it('ten sam seed daje identyczny graf', () => {
    expect(generateLargeGraph(100, 10, 123)).toEqual(generateLargeGraph(100, 10, 123))
  })

  it('ogranicza liczbę krawędzi i nie duplikuje par', () => {
    const g = generateLargeGraph(2000, 30, 1)
    expect(g.edges).toHaveLength(100000)
    const pairs = new Set(g.edges.map(e => `${Math.min(e.from, e.to)}:${Math.max(e.from, e.to)}`))
    expect(pairs.size).toBe(g.edges.length)
  })

  it('ogranicza kosztowne algorytmy', () => {
    expect(algorithmLimit('dijkstra', 5000, 20000)).toBeNull()
    expect(algorithmLimit('bellman', 5000, 20000)).not.toBeNull()
    expect(algorithmLimit('bfs', 10000, 100000)).toBeNull()
  })

  it('generuje ścieżkę, cykl, drzewo, siatkę i graf pełny', () => {
    const path = generateBenchmarkGraph({
      topology: 'path', vertices: 50, densityPercent: 0, seed: 1, weightMin: 1, weightMax: 5, directed: false,
    })
    expect(path.edges).toHaveLength(49)

    const cycle = generateBenchmarkGraph({
      topology: 'cycle', vertices: 40, densityPercent: 0, seed: 2, weightMin: 1, weightMax: 5, directed: false,
    })
    expect(cycle.edges).toHaveLength(40)

    const tree = generateBenchmarkGraph({
      topology: 'tree', vertices: 80, densityPercent: 0, seed: 3, weightMin: 1, weightMax: 5, directed: false,
    })
    expect(tree.edges).toHaveLength(79)

    const grid = generateBenchmarkGraph({
      topology: 'grid', vertices: 100, densityPercent: 0, seed: 4, weightMin: 1, weightMax: 5, directed: false,
    })
    expect(grid.adjacency).toHaveLength(100)
    expect(grid.edges.length).toBeGreaterThan(0)

    const complete = generateBenchmarkGraph({
      topology: 'complete', vertices: 20, densityPercent: 100, seed: 5, weightMin: 1, weightMax: 3, directed: false,
    })
    expect(complete.edges).toHaveLength(20 * 19 / 2)
  })

  it('waliduje limity pamięci i parametrów', () => {
    expect(validateGeneratorParams({
      topology: 'complete', vertices: 500, densityPercent: 100, seed: 1, weightMin: 1, weightMax: 2, directed: false,
    }).ok).toBe(false)

    expect(validateGeneratorParams({
      topology: 'erdos', vertices: 100, densityPercent: 10, seed: 1.5, weightMin: 1, weightMax: 2, directed: false,
    }).ok).toBe(false)

    expect(validateGeneratorParams({
      topology: 'erdos', vertices: 100, densityPercent: 10, seed: 1, weightMin: 5, weightMax: 2, directed: false,
    }).ok).toBe(false)

    expect(estimateEdgeCount({
      topology: 'path', vertices: 1000, densityPercent: 0, directed: false,
    })).toBe(999)
  })

  it('erdos z exact edgeCount respektuje docelową liczbę krawędzi', () => {
    const g = generateBenchmarkGraph({
      topology: 'erdos',
      vertices: 100,
      densityPercent: 10,
      edgeCount: 150,
      seed: 99,
      weightMin: 1,
      weightMax: 10,
      directed: false,
    })
    expect(g.edges).toHaveLength(150)
  })
})
