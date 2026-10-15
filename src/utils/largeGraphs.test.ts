import { describe, expect, it } from 'vitest'
import { algorithmLimit, generateLargeGraph } from './largeGraphs'

describe('Generator dużych grafów', () => {
  it('generuje spójny graf rzadki 10 000 wierzchołków', () => {
    const g=generateLargeGraph(10000,0.01,42)
    expect(g.adjacency).toHaveLength(10000)
    expect(g.edges.length).toBeGreaterThanOrEqual(9999)
    const seen=new Uint8Array(10000), queue=[0];seen[0]=1
    for(let head=0;head<queue.length;head++) for(const e of g.adjacency[queue[head]]) if(!seen[e.to]){seen[e.to]=1;queue.push(e.to)}
    expect(queue).toHaveLength(10000)
  })
  it('ten sam seed daje identyczny graf',()=>{
    expect(generateLargeGraph(100,10,123)).toEqual(generateLargeGraph(100,10,123))
  })
  it('ogranicza liczbę krawędzi i nie duplikuje par',()=>{
    const g=generateLargeGraph(2000,30,1)
    expect(g.edges).toHaveLength(100000)
    const pairs=new Set(g.edges.map(e=>`${Math.min(e.from,e.to)}:${Math.max(e.from,e.to)}`))
    expect(pairs.size).toBe(g.edges.length)
  })
  it('ogranicza kosztowne algorytmy', () => {
  // Dijkstra z Min-Heap obsługuje większe grafy.
  expect(algorithmLimit('dijkstra', 5000, 20000)).toBeNull()

  // Bellman-Ford nadal wymaga ograniczeń.
  expect(algorithmLimit('bellman', 5000, 20000)).not.toBeNull()

  // BFS może przetwarzać duże grafy.
  expect(algorithmLimit('bfs', 10000, 100000)).toBeNull()
})
})
