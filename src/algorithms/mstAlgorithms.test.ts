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
      expect(result.steps.every(step => step.title && step.detail && step.event && step.pseudoLine >= 1)).toBe(true)
    })

    it(`${algorithm}: rozpoznaje graf niespojny`, () => {
      const result = calculateMST({ ...graph, vertices: [...graph.vertices, 'E'] }, algorithm)
      expect(result.connected).toBe(false)
      expect(result.selected).toHaveLength(3)
      expect(result.steps.some(step => /niespój|las/i.test(step.title) || /niespój|las/i.test(step.message))).toBe(true)
    })

    it(`${algorithm}: odrzuca graf skierowany`, () => {
      expect(() => calculateMST({ ...graph, directed: true }, algorithm)).toThrow()
    })
  }

  it('Prim i Kruskal uzyskuja taka sama wage MST', () => {
    expect(calculateMST(graph, 'prim').totalWeight).toBe(calculateMST(graph, 'kruskal').totalWeight)
  })

  it('Prim pokazuje kandydatow przekroju i rosnaca wage', () => {
    const result = calculateMST(graph, 'prim', 'A')
    expect(result.steps.some(step => step.event === 'candidate' && (step.candidates?.length ?? 0) > 0)).toBe(true)
    expect(result.steps.some(step => step.event === 'accept' && step.treeWeight > 0)).toBe(true)
    const weights = result.steps.filter(step => step.event === 'accept').map(step => step.treeWeight)
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1])
    }
    expect(result.steps.at(-1)?.treeWeight).toBe(6)
  })

  it('Kruskal sortuje krawedzie, Union-Find i odrzuca cykl', () => {
    const withEarlyCycle: Graph = {
      directed: false,
      vertices: ['A', 'B', 'C', 'D'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'A', target: 'C', weight: 1.5 },
        { source: 'B', target: 'C', weight: 2 },
        { source: 'C', target: 'D', weight: 3 },
      ],
    }
    const result = calculateMST(withEarlyCycle, 'kruskal')
    expect(result.steps.some(step => step.event === 'sort' && (step.sortedOrder?.length ?? 0) === 4)).toBe(true)
    expect(result.steps.some(step => step.event === 'union' && step.components)).toBe(true)
    expect(result.steps.some(step => step.event === 'reject')).toBe(true)
    const reject = result.steps.find(step => step.event === 'reject')
    expect(reject?.reason).toMatch(/cykl|find/i)
    expect(result.totalWeight).toBe(5.5)
  })

  it('dwa komponenty z krawedziami: Prim i Kruskal buduja ten sam koszt lasu', () => {
    const forest: Graph = {
      directed: false,
      vertices: ['A', 'B', 'C', 'D'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'C', target: 'D', weight: 2 },
      ],
    }
    const prim = calculateMST(forest, 'prim', 'A')
    const kruskal = calculateMST(forest, 'kruskal')
    expect(prim.connected).toBe(false)
    expect(kruskal.connected).toBe(false)
    expect(prim.totalWeight).toBe(3)
    expect(kruskal.totalWeight).toBe(3)
    expect(prim.selected).toHaveLength(2)
    expect(kruskal.selected).toHaveLength(2)
    expect(prim.steps.some(step => /Nowe drzewo|lasu/i.test(step.title))).toBe(true)
  })
})
