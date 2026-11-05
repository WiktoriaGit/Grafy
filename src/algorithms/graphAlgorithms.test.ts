import { describe, expect, it } from 'vitest'
import {
  fromEditor,
  pathFromParents,
  runAlgorithm,
  type Graph,
} from './graphAlgorithms'

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

  it('BFS eksploruje wszystkie osiagalne wierzcholki mimo wczesnego celu', () => {
    const result = runAlgorithm(graph, 'bfs', 'A', 'C')
    expect(result.path).toEqual(['A', 'C'])
    expect(result.reachable.sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(result.order).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']))
    expect(result.steps.some(step => step.structureKind === 'queue')).toBe(true)
    expect(result.steps.some(step => step.event === 'discover')).toBe(true)
    expect(result.examinedEdges).toBeGreaterThan(0)
    expect(result.steps.every(step => step.title && step.detail && step.pseudoLine >= 1)).toBe(true)
  })

  it('DFS dociera do osiagalnego celu i eksploruje caly zbior osiagalny', () => {
    const result = runAlgorithm(graph, 'dfs', 'A', 'D')
    expect(result.path[0]).toBe('A')
    expect(result.path.at(-1)).toBe('D')
    expect(result.distance).toBe(result.path.length - 1)
    expect(result.reachable.sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(result.steps.some(step => step.structureKind === 'stack')).toBe(true)
  })

  it('brak sciezki zwraca pusty wynik, ale odwiedza osiagalne', () => {
    const result = runAlgorithm(graph, 'bfs', 'D', 'A')
    expect(result.path).toEqual([])
    expect(result.distance).toBeNull()
    expect(result.reachable).toEqual(['D'])
  })

  it('BFS uzasadnia pominięcie już odkrytego wierzchołka', () => {
    const result = runAlgorithm(graph, 'bfs', 'A', 'D')
    const skip = result.steps.find(step => step.event === 'skip' && step.reason)
    expect(skip?.reason).toBeTruthy()
    expect(skip?.activeEdge).toBeTruthy()
  })
})

describe('Najkrotsze sciezki', () => {
  it('Dijkstra znajduje najtansza trase wazona', () => {
    const result = runAlgorithm(graph, 'dijkstra', 'A', 'D')
    expect(result.path).toEqual(['A', 'C', 'B', 'D'])
    expect(result.distance).toBe(6)
  })

  it('Dijkstra eksploruje wszystkie osiagalne i aktualizuje odległości', () => {
    const result = runAlgorithm(graph, 'dijkstra', 'A', 'C')
    expect(result.reachable.sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(result.path).toEqual(['A', 'C'])
    expect(result.distance).toBe(2)
    const relaxC = result.steps.find(step =>
      step.event === 'relax' && step.distanceUpdates?.some(update => update.vertex === 'C' && update.next === 2),
    )
    expect(relaxC).toBeTruthy()
    expect(relaxC?.reason).toContain('<')
    expect(result.steps.some(step => step.distances?.D === 6)).toBe(true)
    expect(result.steps.some(step => step.parents?.D === 'B')).toBe(true)
    expect(result.steps.some(step => step.structureKind === 'priority')).toBe(true)
  })

  it('po eksploracji Dijkstry mozna odtworzyc sciezke do innego celu', () => {
    const result = runAlgorithm(graph, 'dijkstra', 'A', 'C')
    expect(pathFromParents(result.start, 'D', result.parents)).toEqual(['A', 'C', 'B', 'D'])
    expect(result.distances.D).toBe(6)
  })

  it('Dijkstra odrzuca ujemne wagi', () => {
    expect(() => runAlgorithm({ ...graph, links: [{ source: 'A', target: 'B', weight: -1 }] }, 'dijkstra', 'A', 'B')).toThrow()
  })

  it('Bellman-Ford obsluguje ujemna wage bez ujemnego cyklu', () => {
    const result = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 4 },
        { source: 'A', target: 'C', weight: 8 },
        { source: 'B', target: 'C', weight: -3 },
      ],
    }, 'bellman', 'A', 'C')
    expect(result.distance).toBe(1)
    expect(result.path).toEqual(['A', 'B', 'C'])
  })

  it('Bellman-Ford sygnalizuje ujemny cykl wplywajacy na cel', () => {
    const result = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'B', target: 'C', weight: -3 },
        { source: 'C', target: 'B', weight: 1 },
      ],
    }, 'bellman', 'A', 'C')
    expect(result.error).toBeTruthy()
    expect(result.distance).toBeNull()
    expect(result.steps.some(step => /ujemn/i.test(step.title) || /ujemn/i.test(step.message))).toBe(true)
  })

  it('Bellman-Ford zapisuje iteracje, relaksacje i uzasadnienia', () => {
    const result = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 4 },
        { source: 'A', target: 'C', weight: 8 },
        { source: 'B', target: 'C', weight: -3 },
      ],
    }, 'bellman', 'A', 'C')
    expect(result.steps.some(step => step.event === 'init')).toBe(true)
    expect(result.steps.some(step => step.event === 'visit' && /Iteracja/i.test(step.title))).toBe(true)
    expect(result.steps.some(step => step.event === 'relax' && step.distanceUpdates?.length)).toBe(true)
    expect(result.steps.some(step => step.event === 'skip' && step.reason)).toBe(true)
    expect(result.steps.every(step => step.detail && step.pseudoLine >= 1)).toBe(true)
    expect(result.distances.A).toBe(0)
    expect(result.distances.B).toBe(4)
    expect(result.distances.C).toBe(1)
    expect(result.steps.at(-1)?.distances?.C).toBe(1)
  })

  it('Bellman-Ford na nieskierowanym grafie z wagami nieujemnymi', () => {
    const result = runAlgorithm({
      directed: false,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 2 },
        { source: 'B', target: 'C', weight: 3 },
      ],
    }, 'bellman', 'A', 'C')
    expect(result.error).toBeFalsy()
    expect(result.distance).toBe(5)
    expect(result.path).toEqual(['A', 'B', 'C'])
  })

  it('ujemna waga na nieskierowanym grafie tworzy cykl 2-krawedziowy', () => {
    const result = runAlgorithm({
      directed: false,
      vertices: ['A', 'B'],
      links: [{ source: 'A', target: 'B', weight: -1 }],
    }, 'bellman', 'A', 'B')
    expect(result.error).toBeTruthy()
  })
})

describe('Walidacja grafu z edytora', () => {
  it('odczytuje wagi zapisane w etykietach krawedzi', () => {
    expect(fromEditor({
      directed: false,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ source: 'A', target: 'B', label: '7' }],
    }).links[0].weight).toBe(7)
  })

  it('odrzuca krawedz do nieistniejacego wierzcholka', () => {
    expect(() => fromEditor({
      directed: true,
      nodes: [{ id: 'A' }],
      edges: [{ source: 'A', target: 'X' }],
    })).toThrow()
  })
})
