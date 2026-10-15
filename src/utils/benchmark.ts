export type AlgorithmId = 'bfs' | 'dfs' | 'dijkstra' | 'bellman'
export type BenchGraph = { adjacency: { to: number; weight: number }[][]; edges: { from: number; to: number; weight: number }[] }
export type BenchResult = { id: string; algorithm: AlgorithmId; vertices: number; edges: number; density: number; repetitions: number; mean: number; min: number; max: number; operations: number; reached: boolean; timestamp: string }
export const algorithmLabels: Record<AlgorithmId,string> = { bfs:'BFS', dfs:'DFS', dijkstra:'Dijkstra', bellman:'Bellman–Ford' }
export function generateGraph(n: number, density: number, seed: number): BenchGraph {
  let state = seed >>> 0
  const rand = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
  const adjacency: BenchGraph['adjacency'] = Array.from({length:n},()=>[])
  const edges: BenchGraph['edges'] = []
  // A connected, undirected graph with positive weights.
  const add = (a:number,b:number) => { const weight=1+Math.floor(rand()*20); adjacency[a].push({to:b,weight}); adjacency[b].push({to:a,weight}); edges.push({from:a,to:b,weight}) }
  const used = new Set<string>()
  for(let v=1;v<n;v++){ const u=Math.floor(rand()*v); add(u,v); used.add(`${u}:${v}`) }
  const maxEdges=n*(n-1)/2
  const target=Math.min(maxEdges,Math.max(n-1,Math.round(maxEdges*density/100)))
  let attempts=0
  while(edges.length<target && attempts<target*15+100){ attempts++; const a=Math.floor(rand()*n),b=Math.floor(rand()*n); if(a===b)continue; const lo=Math.min(a,b),hi=Math.max(a,b),key=`${lo}:${hi}`; if(used.has(key))continue; used.add(key); add(lo,hi) }
  return {adjacency,edges}
}
/** Binary min-heap for (distance, vertex); duplicate entries are skipped on pop. */
export class MinHeap {
  private items: { vertex: number; distance: number }[] = []
  get size() { return this.items.length }
  push(vertex: number, distance: number) {
    const item = { vertex, distance }
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent].distance <= item.distance) break
      a[i] = a[parent]
      i = parent
    }
    a[i] = item
  }
  pop(): { vertex: number; distance: number } | undefined {
    const a = this.items
    if (!a.length) return undefined
    const first = a[0]
    const last = a.pop()!
    if (a.length) {
      let i = 0
      while (2 * i + 1 < a.length) {
        let child = 2 * i + 1
        if (child + 1 < a.length && a[child + 1].distance < a[child].distance) child++
        if (a[child].distance >= last.distance) break
        a[i] = a[child]
        i = child
      }
      a[i] = last
    }
    return first
  }
}

export type DijkstraResult = { distances: number[]; operations: number; reached: boolean }

function validateDijkstraGraph(g: BenchGraph) {
  for (const neighbors of g.adjacency) for (const e of neighbors) {
    if (!Number.isFinite(e.weight) || e.weight < 0) throw new Error('Dijkstra wymaga skończonych wag nieujemnych.')
  }
}

/** Previous quadratic implementation retained as a correctness/performance baseline. */
export function dijkstraLinear(g: BenchGraph, source = 0): DijkstraResult {
  validateDijkstraGraph(g)
  const n = g.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) throw new Error('Nieprawidłowy wierzchołek początkowy.')
  const dist = Array<number>(n).fill(Infinity)
  const visited = new Uint8Array(n)
  dist[source] = 0
  let operations = 0
  for (let i = 0; i < n; i++) {
    let v = -1, best = Infinity
    for (let j = 0; j < n; j++) {
      operations++
      if (!visited[j] && dist[j] < best) { best = dist[j]; v = j }
    }
    if (v < 0) break
    visited[v] = 1
    for (const e of g.adjacency[v]) {
      operations++
      if (dist[v] + e.weight < dist[e.to]) dist[e.to] = dist[v] + e.weight
    }
  }
  return { distances: dist, operations, reached: Number.isFinite(dist[n - 1]) }
}

/** Dijkstra with adjacency lists and a binary min-heap: O((V+E) log V). */
export function dijkstraHeap(g: BenchGraph, source = 0): DijkstraResult {
  validateDijkstraGraph(g)
  const n = g.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) throw new Error('Nieprawidłowy wierzchołek początkowy.')
  const dist = Array<number>(n).fill(Infinity)
  const heap = new MinHeap()
  dist[source] = 0
  heap.push(source, 0)
  let operations = 0
  while (heap.size) {
    const item = heap.pop()!
    operations++
    if (item.distance !== dist[item.vertex]) continue
    for (const e of g.adjacency[item.vertex]) {
      operations++
      const candidate = item.distance + e.weight
      if (candidate < dist[e.to]) {
        dist[e.to] = candidate
        heap.push(e.to, candidate)
      }
    }
  }
  return { distances: dist, operations, reached: Number.isFinite(dist[n - 1]) }
}

export function runBenchmarkAlgorithm(g: BenchGraph, id: AlgorithmId): { operations: number; reached: boolean } {
  const n = g.adjacency.length, target = n - 1
  let operations = 0
  if (id === 'bfs' || id === 'dfs') {
    const seen = new Uint8Array(n), queue = [0]
    seen[0] = 1
    let head = 0
    while (id === 'bfs' ? head < queue.length : queue.length > 0) {
      const v = id === 'bfs' ? queue[head++] : queue.pop()!
      if (v === target) return { operations, reached: true }
      for (const e of g.adjacency[v]) {
        operations++
        if (!seen[e.to]) { seen[e.to] = 1; queue.push(e.to) }
      }
    }
    return { operations, reached: false }
  }
  if (id === 'dijkstra') {
    const result = dijkstraHeap(g)
    return { operations: result.operations, reached: result.reached }
  }
  const dist = new Float64Array(n).fill(Infinity)
  dist[0] = 0
  for (let i = 1; i < n; i++) {
    let changed = false
    for (const e of g.edges) {
      operations += 2
      if (dist[e.from] + e.weight < dist[e.to]) { dist[e.to] = dist[e.from] + e.weight; changed = true }
      if (dist[e.to] + e.weight < dist[e.from]) { dist[e.from] = dist[e.to] + e.weight; changed = true }
    }
    if (!changed) break
  }
  return { operations, reached: Number.isFinite(dist[target]) }
}

export function measure(g:BenchGraph,id:AlgorithmId,repetitions:number):BenchResult {
  // Warm-up reduces one-time JIT effects; results remain environment-dependent.
  runBenchmarkAlgorithm(g,id)
  const times:number[]=[];let operations=0,reached=false
  for(let i=0;i<repetitions;i++){
    const start=performance.now()
    const result=runBenchmarkAlgorithm(g,id)
    times.push(performance.now()-start)
    operations=result.operations;reached=result.reached
  }
  return {id:`${Date.now()}-${id}-${Math.random().toString(36).slice(2,8)}`,algorithm:id,vertices:g.adjacency.length,edges:g.edges.length,density:Math.round(g.edges.length/(g.adjacency.length*(g.adjacency.length-1)/2)*10000)/100,repetitions,mean:times.reduce((a,b)=>a+b,0)/times.length,min:Math.min(...times),max:Math.max(...times),operations,reached,timestamp:new Date().toISOString()}
}
export const STORAGE_KEY='graphlab-benchmarks-v1'
export function loadResults():BenchResult[]{try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(raw)?raw:[]}catch{return []}}
export function saveResults(rows:BenchResult[]){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows.slice(0,200)))}
export function exportCSV(rows:BenchResult[]){
  const header=['algorytm','wierzcholki','krawedzie','gestosc_proc','powtorzenia','srednia_ms','min_ms','max_ms','operacje','osiagnieto_cel','data']
  const lines=rows.map(r=>[algorithmLabels[r.algorithm],r.vertices,r.edges,r.density,r.repetitions,r.mean.toFixed(5),r.min.toFixed(5),r.max.toFixed(5),r.operations,r.reached,r.timestamp].join(';'))
  const blob=new Blob(['\uFEFF'+[header.join(';'),...lines].join('\r\n')],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='graphlab-wyniki.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
