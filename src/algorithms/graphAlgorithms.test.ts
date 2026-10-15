import { describe, expect, it } from 'vitest'
import { fromEditor, runAlgorithm, type Graph } from './graphAlgorithms'

const graph: Graph = {
  directed: true,
  vertices: ['A', 'B', 'C', 'D', 'E'],
  links: [
    { source: 'A', target: 'B', weight: 10 },
    { source: 'A', target: 'C', weight: 2 },
    { source: 'C', target: 'B', weight: 1 },
    { source: 'B', target: 'D', weight: 3 },
    { source: 'C', target: 'D', weight: 9 },
  ],
}

describe('Przeszukiwanie grafu', () => {
  it('BFS znajduje sciezke z najmniejsza liczba krawedzi', () => {
    const result = runAlgorithm(graph, 'bfs', 'A', 'D')
    expect(result.distance).toBe(2)
    expect(result.path[0]).toBe('A')
    expect(result.path.at(-1)).toBe('D')
    expect(result.order).toContain('A')
  })
  it('DFS dociera do osiagalnego celu', () => {
    const result = runAlgorithm(graph, 'dfs', 'A', 'D')
    expect(result.path[0]).toBe('A')
    expect(result.path.at(-1)).toBe('D')
    expect(result.distance).toBe(result.path.length - 1)
  })
  it('brak sciezki zwraca pusty wynik', () => {
    const result = runAlgorithm(graph, 'bfs', 'D', 'A')
    expect(result.path).toEqual([])
    expect(result.distance).toBeNull()
  })
})

describe('Najkrotsze sciezki', () => {
  it('Dijkstra znajduje najtansza trase wazona', () => {
    const result = runAlgorithm(graph, 'dijkstra', 'A', 'D')
    expect(result.path).toEqual(['A', 'C', 'B', 'D'])
    expect(result.distance).toBe(6)
  })
  it('Dijkstra odrzuca ujemne wagi', () => {
    expect(() => runAlgorithm({ ...graph, links: [{ source: 'A', target: 'B', weight: -1 }] }, 'dijkstra', 'A', 'B')).toThrow()
  })
  it('Bellman-Ford obsluguje ujemna wage bez ujemnego cyklu', () => {
    const result = runAlgorithm({ directed: true, vertices: ['A', 'B', 'C'], links: [
      { source: 'A', target: 'B', weight: 4 },
      { source: 'A', target: 'C', weight: 8 },
      { source: 'B', target: 'C', weight: -3 },
    ] }, 'bellman', 'A', 'C')
    expect(result.distance).toBe(1)
    expect(result.path).toEqual(['A', 'B', 'C'])
  })
  it('Bellman-Ford sygnalizuje ujemny cykl wplywajacy na cel', () => {
    const result = runAlgorithm({ directed: true, vertices: ['A', 'B', 'C'], links: [
      { source: 'A', target: 'B', weight: 1 },
      { source: 'B', target: 'C', weight: -3 },
      { source: 'C', target: 'B', weight: 1 },
    ] }, 'bellman', 'A', 'C')
    expect(result.error).toBeTruthy()
    expect(result.distance).toBeNull()
  })
})

describe('Walidacja grafu z edytora', () => {
  it('odczytuje wagi zapisane w etykietach krawedzi', () => {
    expect(fromEditor({ directed: false, nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ source: 'A', target: 'B', label: '7' }] }).links[0].weight).toBe(7)
  })
  it('odrzuca krawedz do nieistniejacego wierzcholka', () => {
    expect(() => fromEditor({ directed: true, nodes: [{ id: 'A' }], edges: [{ source: 'A', target: 'X' }] })).toThrow()
  })
})
