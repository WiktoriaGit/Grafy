import { describe, expect, it } from 'vitest'
import { calculateMST } from './mstAlgorithms'
import type { Graph } from './graphAlgorithms'

const graph: Graph = {
  directed: false,
  vertices: ['A', 'B', 'C', 'D'],
  links: [
    { source: 'A', target: 'B', weight: 1 },
    { source: 'A', target: 'C', weight: 4 },
    { source: 'B', target: 'C', weight: 2 },
    { source: 'B', target: 'D', weight: 5 },
    { source: 'C', target: 'D', weight: 3 },
  ],
}

describe('Minimalne drzewo rozpinajace', () => {
  for (const algorithm of ['prim', 'kruskal'] as const) {
    it(`${algorithm}: wybiera 3 krawedzie o lacznej wadze 6`, () => {
      const result = calculateMST(graph, algorithm)
      expect(result.connected).toBe(true)
      expect(result.selected).toHaveLength(3)
      expect(result.totalWeight).toBe(6)
      expect(result.steps.length).toBeGreaterThan(0)
    })
    it(`${algorithm}: rozpoznaje graf niespojny`, () => {
      const result = calculateMST({ ...graph, vertices: [...graph.vertices, 'E'] }, algorithm)
      expect(result.connected).toBe(false)
      expect(result.selected).toHaveLength(3)
    })
    it(`${algorithm}: odrzuca graf skierowany`, () => {
      expect(() => calculateMST({ ...graph, directed: true }, algorithm)).toThrow()
    })
  }
  it('Prim i Kruskal uzyskuja taka sama wage MST', () => {
    expect(calculateMST(graph, 'prim').totalWeight).toBe(calculateMST(graph, 'kruskal').totalWeight)
  })
})
