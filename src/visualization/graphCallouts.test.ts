import { describe, expect, it } from 'vitest'
import { runAlgorithm } from '../algorithms/graphAlgorithms'
import { calculateMST } from '../algorithms/mstAlgorithms'
import {
  calloutFromMstStep,
  calloutFromStep,
  calloutsFromStep,
} from './graphCallouts'

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

describe('Jedna aktywna tabliczka na krok', () => {
  it('Dijkstra: każdy krok ma co najwyżej jedno okienko i zmienia kotwicę', () => {
    const run = runAlgorithm(weighted, 'dijkstra', 'A', 'D')
    for (let i = 0; i < run.steps.length; i++) {
      const list = calloutsFromStep(run.steps[i], i)
      expect(list.length).toBeLessThanOrEqual(1)
    }

    const relaxIdx = run.steps.findIndex(s => s.event === 'relax' && s.distanceUpdates?.length)
    expect(relaxIdx).toBeGreaterThanOrEqual(0)
    const relax = calloutFromStep(run.steps[relaxIdx], relaxIdx)!
    expect(relax.anchor.type).toBe('node')
    if (relax.anchor.type === 'node') {
      expect(relax.anchor.id).toBe(run.steps[relaxIdx].distanceUpdates![0].vertex)
    }

    const selectIdx = run.steps.findIndex(s => s.event === 'select')
    const select = calloutFromStep(run.steps[selectIdx], selectIdx)!
    expect(select.anchor.type).toBe('node')

    // Zmiana kroku → inny id (poprzednia tabliczka nie pozostaje w stanie).
    expect(relax.id).not.toBe(select.id)
  })

  it('BFS: odkrycie sąsiada — jedno okienko przy nowym wierzchołku', () => {
    const run = runAlgorithm(weighted, 'bfs', 'A', 'D')
    const discoverIdx = run.steps.findIndex(s => s.event === 'discover')
    const callouts = calloutsFromStep(run.steps[discoverIdx], discoverIdx)
    expect(callouts).toHaveLength(1)
    expect(callouts[0].anchor.type).toBe('node')
  })

  it('DFS: wejście do wierzchołka kotwiczy się w aktualnym wierzchołku', () => {
    const run = runAlgorithm(weighted, 'dfs', 'A', 'D')
    const visitIdx = run.steps.findIndex(s => s.event === 'visit' || s.event === 'extract')
    const callout = calloutFromStep(run.steps[visitIdx], visitIdx)!
    expect(callout.anchor.type).toBe('node')
  })

  it('Bellman–Ford: relaksacja przy ujemnej wadze — jedno okienko', () => {
    const run = runAlgorithm({
      directed: true,
      vertices: ['A', 'B', 'C'],
      links: [
        { source: 'A', target: 'B', weight: 4 },
        { source: 'A', target: 'C', weight: 8 },
        { source: 'B', target: 'C', weight: -3 },
      ],
    }, 'bellman', 'A', 'C')
    const relaxIdx = run.steps.findIndex(s => s.event === 'relax')
    expect(calloutsFromStep(run.steps[relaxIdx], relaxIdx)).toHaveLength(1)
  })

  it('Prim/Kruskal: akceptacja krawędzi kotwiczy się na krawędzi', () => {
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
    const acceptIdx = prim.steps.findIndex(s => s.event === 'accept')
    const accept = calloutFromMstStep(prim.steps[acceptIdx], acceptIdx)!
    expect(accept.anchor.type).toBe('edge')

    const kruskal = calculateMST(graph, 'kruskal')
    const rejectIdx = kruskal.steps.findIndex(s => s.event === 'reject')
    if (rejectIdx >= 0) {
      expect(calloutFromMstStep(kruskal.steps[rejectIdx], rejectIdx)!.anchor.type).toBe('edge')
    }
  })

  it('done / init bez aktualnego wierzchołka → kotwica canvas', () => {
    const run = runAlgorithm(weighted, 'dijkstra', 'A', 'D')
    const doneIdx = run.steps.findIndex(s => s.event === 'done')
    const done = calloutFromStep(run.steps[doneIdx], doneIdx)!
    expect(done.anchor.type).toBe('canvas')
  })

  it('poprzedni/następny krok zmienia identyfikator tabliczki', () => {
    const run = runAlgorithm(weighted, 'dijkstra', 'A', 'D')
    const a = calloutFromStep(run.steps[0], 0)!
    const b = calloutFromStep(run.steps[Math.min(3, run.steps.length - 1)], 3)!
    expect(a.id).not.toBe(b.id)
  })
})
