import { describe, expect, it } from 'vitest'
import { runAlgorithm } from '../algorithms/graphAlgorithms'
import { calculateMST } from '../algorithms/mstAlgorithms'
import { calloutsFromMstStep, calloutsFromStep } from './graphCallouts'

const weighted = {
  directed: true,
  vertices: ['A', 'B', 'C', 'D'],
  links: [
    { source: 'A', target: 'B', weight: 4 },
    { source: 'A', target: 'C', weight: 2 },
    { source: 'C', target: 'B', weight: 1 },
    { source: 'B', target: 'D', weight: 3 },
    { source: 'C', target: 'D', weight: 9 },
  ],
}

describe('Kontekstowe okienka na grafie', () => {
  it('Dijkstra: relaksacja daje jedno niesparowane okienko (bez duplikatu odległości)', () => {
    const run = runAlgorithm(weighted, 'dijkstra', 'A', 'D')
    const relax = run.steps.find(step => step.event === 'relax' && step.distanceUpdates?.length)
    expect(relax).toBeTruthy()
    const relaxCallouts = calloutsFromStep(relax)
    expect(relaxCallouts.length).toBe(1)
    expect(relaxCallouts[0].kind).toBe('update')
    expect(relaxCallouts[0].body).toMatch(/→/)

    const select = run.steps.find(step => step.event === 'select' || step.event === 'extract')
      ?? run.steps.find(step => step.current != null)
    expect(select).toBeTruthy()
    const selectCallouts = calloutsFromStep(select)
    expect(selectCallouts.length).toBe(1)
    expect(selectCallouts[0].anchor.type).toBe('node')
  })

  it('BFS: odkrycie sąsiada i kolejka', () => {
    const run = runAlgorithm(weighted, 'bfs', 'A', 'D')
    const discover = run.steps.find(step => step.event === 'discover')
    expect(discover).toBeTruthy()
    const callouts = calloutsFromStep(discover)
    expect(callouts[0]?.body.length).toBeGreaterThan(0)
    expect(callouts.every(c => c.headline && c.body)).toBe(true)
  })

  it('DFS: wejście do wierzchołka', () => {
    const run = runAlgorithm(weighted, 'dfs', 'A', 'D')
    const visit = run.steps.find(step => step.event === 'visit' || step.event === 'extract')
    expect(visit).toBeTruthy()
    const callouts = calloutsFromStep(visit)
    expect(callouts.some(c => c.anchor.type === 'node')).toBe(true)
  })

  it('Bellman–Ford: ujemne wagi dają komunikaty relaksacji', () => {
    const run = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 4 },
        { source: 'A', target: 'C', weight: 8 },
        { source: 'B', target: 'C', weight: -3 },
      ],
    }, 'bellman', 'A', 'C')
    const relax = run.steps.find(step => step.event === 'relax')
    expect(relax).toBeTruthy()
    const callouts = calloutsFromStep(relax)
    expect(callouts.length).toBeGreaterThan(0)
    expect(callouts.some(c => /odległ/i.test(c.body) || /relaks/i.test(c.headline + c.body) || c.kind === 'update')).toBe(true)
  })

  it('Prim/Kruskal: wybór i odrzucenie krawędzi', () => {
    const graph = {
      directed: false,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'B', target: 'C', weight: 2 },
        { source: 'A', target: 'C', weight: 5 },
      ],
    }
    const prim = calculateMST(graph, 'prim', 'A')
    const accept = prim.steps.find(step => step.event === 'accept')
    expect(calloutsFromMstStep(accept).some(c => c.kind === 'update' || c.anchor.type === 'edge')).toBe(true)

    const kruskal = calculateMST(graph, 'kruskal')
    const reject = kruskal.steps.find(step => step.event === 'reject')
    if (reject) {
      expect(calloutsFromMstStep(reject).some(c => c.kind === 'skip')).toBe(true)
    }
    expect(calloutsFromMstStep(kruskal.steps.find(s => s.event === 'accept')).length).toBeGreaterThan(0)
  })

  it('poprzedni/następny krok zmienia zestaw okienek', () => {
    const run = runAlgorithm(weighted, 'dijkstra', 'A', 'D')
    const a = calloutsFromStep(run.steps[0])
    const b = calloutsFromStep(run.steps[Math.min(3, run.steps.length - 1)])
    expect(a[0]?.id).not.toBe(b[0]?.id)
  })
})
