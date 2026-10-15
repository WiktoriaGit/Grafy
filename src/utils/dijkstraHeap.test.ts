import { describe, expect, it } from 'vitest'
import { dijkstraHeap, dijkstraLinear, MinHeap, runBenchmarkAlgorithm, type BenchGraph } from './benchmark'
import { algorithmLimit, generateLargeGraph } from './largeGraphs'

describe('Dijkstra — kopiec binarny', () => {
  it('wyjmuje elementy według rosnących priorytetów', () => {
    const heap = new MinHeap()
    for (const [v, d] of [[1, 7], [2, 2], [3, 5], [4, 1]]) heap.push(v, d)
    expect([heap.pop()?.distance, heap.pop()?.distance, heap.pop()?.distance, heap.pop()?.distance]).toEqual([1, 2, 5, 7])
    expect(heap.pop()).toBeUndefined()
  })
  it('zwraca poprawne odległości dla małego grafu', () => {
    const graph: BenchGraph = {
      adjacency: [
        [{ to: 1, weight: 4 }, { to: 2, weight: 1 }],
        [{ to: 0, weight: 4 }, { to: 2, weight: 2 }, { to: 3, weight: 1 }],
        [{ to: 0, weight: 1 }, { to: 1, weight: 2 }, { to: 3, weight: 9 }],
        [{ to: 1, weight: 1 }, { to: 2, weight: 9 }],
      ], edges: [],
    }
    expect(dijkstraHeap(graph).distances).toEqual([0, 3, 1, 4])
    expect(dijkstraHeap(graph).distances).toEqual(dijkstraLinear(graph).distances)
  })
  it('zgadza się z wersją liniową na losowych grafach', () => {
    for (const n of [10, 50, 100, 200]) {
      const graph = generateLargeGraph(n, 7, 12345)
      expect(dijkstraHeap(graph).distances).toEqual(dijkstraLinear(graph).distances)
    }
  })
  it('poprawnie obsługuje nieosiągalne wierzchołki', () => {
    const graph: BenchGraph = { adjacency: [[{ to: 1, weight: 2 }], [{ to: 0, weight: 2 }], []], edges: [] }
    expect(dijkstraHeap(graph).distances).toEqual([0, 2, Infinity])
    expect(dijkstraHeap(graph).reached).toBe(false)
  })
  it('odrzuca ujemne wagi', () => {
    const graph: BenchGraph = { adjacency: [[{ to: 1, weight: -1 }], []], edges: [] }
    expect(() => dijkstraHeap(graph)).toThrow()
  })
  it('obsługuje duży graf i nie blokuje go stary limit 2000', () => {
    const graph = generateLargeGraph(2500, 0.2, 12345)
    expect(algorithmLimit('dijkstra', 2500, graph.edges.length)).toBeNull()
    expect(runBenchmarkAlgorithm(graph, 'dijkstra').reached).toBe(true)
  })
})
