import { describe, expect, it } from 'vitest'
import { fromEditor, runAlgorithm } from '../algorithms/graphAlgorithms'
import {
  autoLayoutPositions,
  parseWorkspace,
  serializeWorkspace,
  workspaceToFlow,
} from './graphWorkspace'
import { validateGraphForAlgorithm } from './validateAlgorithm'

describe('Integracja edytora z algorytmami', () => {
  it('zachowuje rozmieszczenie i wagi przy serializacji workspace', () => {
    const nodes = [
      { id: 'A', position: { x: 10, y: 20 }, data: { label: 'A' }, style: {} },
      { id: 'B', position: { x: 110, y: 20 }, data: { label: 'B' }, style: {} },
      { id: 'C', position: { x: 210, y: 20 }, data: { label: 'C' }, style: {} },
    ]
    const edges = [
      { id: '1', source: 'A', target: 'B', label: '2', sourceHandle: 'top', targetHandle: 'left' },
      { id: '2', source: 'B', target: 'C', label: '3', sourceHandle: 'right', targetHandle: 'top' },
    ]
    const saved = serializeWorkspace(nodes as never, edges as never, true, 'A', 'C')
    expect(saved.edges[0]).toMatchObject({ sourceHandle: 'top', targetHandle: 'left' })
    const restored = workspaceToFlow(parseWorkspace(saved))
    expect(restored.nodes.map(n => n.id)).toEqual(['A', 'B', 'C'])
    expect(restored.nodes[0].position).toEqual({ x: 10, y: 20 })
    expect(restored.nodes.every(n => n.type === 'graphVertex')).toBe(true)
    expect(restored.edges.map(e => Number(e.label))).toEqual([2, 3])
    expect(restored.edges[0].sourceHandle).toBe('top')
    expect(restored.edges[0].targetHandle).toBe('left')
    expect(restored.edges[1].sourceHandle).toBe('right')
    expect(restored.edges[1].targetHandle).toBe('top')
    expect(restored.directed).toBe(true)
  })

  it('przekazuje graf A→B(2), B→C(3) do Dijkstry z poprawnymi odległościami', () => {
    const workspace = parseWorkspace({
      version: 1,
      directed: true,
      nodes: [
        { id: 'A', position: { x: 0, y: 0 } },
        { id: 'B', position: { x: 100, y: 0 } },
        { id: 'C', position: { x: 200, y: 0 } },
      ],
      edges: [
        { source: 'A', target: 'B', weight: 2 },
        { source: 'B', target: 'C', weight: 3 },
      ],
      start: 'A',
      end: 'C',
    })
    const graph = fromEditor(workspace)
    const result = runAlgorithm(graph, 'dijkstra', 'A', 'C')
    expect(result.distances.A).toBe(0)
    expect(result.distances.B).toBe(2)
    expect(result.distances.C).toBe(5)
    expect(result.path).toEqual(['A', 'B', 'C'])
  })

  it('blokuje Dijkstrę przy ujemnych wagach prostym komunikatem', () => {
    const graph = fromEditor({
      directed: true,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ source: 'A', target: 'B', weight: -2 }],
    })
    const validation = validateGraphForAlgorithm(graph, 'dijkstra', 'A', 'B')
    expect(validation.ok).toBe(false)
    expect(validation.title).toMatch(/ujemnych wag/i)
  })

  it('pozwala uruchomić BFS na grafie nieskierowanym', () => {
    const graph = fromEditor({
      directed: false,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ source: 'A', target: 'B', weight: 1 }],
    })
    const validation = validateGraphForAlgorithm(graph, 'bfs', 'A', 'B')
    expect(validation.ok).toBe(true)
    expect(runAlgorithm(graph, 'bfs', 'A', 'B').path).toEqual(['A', 'B'])
  })

  it('odrzuca pętle własne przy odczycie workspace', () => {
    expect(() => parseWorkspace({
      directed: true,
      nodes: [{ id: 'A', position: { x: 0, y: 0 } }],
      edges: [{ source: 'A', target: 'A', weight: 1 }],
    })).toThrow(/Pętle/)
  })

  it('generuje pozycje layoutu dla kilku wierzchołków', () => {
    expect(autoLayoutPositions(3)).toHaveLength(3)
    expect(autoLayoutPositions(1)[0]).toEqual({ x: 360, y: 230 })
  })
})
