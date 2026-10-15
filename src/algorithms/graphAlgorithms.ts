export type Vertex = string
export type Link = { source: string; target: string; weight: number }
export type Graph = { vertices: Vertex[]; links: Link[]; directed: boolean }
export type Step = { current: string | null; visited: string[]; frontier: string[]; activeEdge?: string; message: string }
export type Run = { steps: Step[]; order: string[]; path: string[]; distance: number | null; operations: number; durationMs: number; error?: string }
export type Algorithm = 'bfs' | 'dfs' | 'dijkstra' | 'bellman'

export function fromEditor(raw: unknown): Graph {
  if (!raw || typeof raw !== 'object') throw new Error('Nieprawidłowe dane grafu')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges) || typeof obj.directed !== 'boolean') throw new Error('Nieprawidłowy format grafu')
  if (obj.nodes.length > 300 || obj.edges.length > 3000) throw new Error('Graf jest zbyt duży dla wizualizacji')
  const vertices = obj.nodes.map((n: unknown) => {
    if (!n || typeof n !== 'object' || typeof (n as { id?: unknown }).id !== 'string') throw new Error('Błędny wierzchołek')
    return (n as { id: string }).id
  })
  if (new Set(vertices).size !== vertices.length) throw new Error('Powtarzające się identyfikatory wierzchołków')
  const ids = new Set(vertices)
  const links = obj.edges.map((e: unknown) => {
    if (!e || typeof e !== 'object') throw new Error('Błędna krawędź')
    const item = e as Record<string, unknown>
    const source = String(item.source ?? '')
    const target = String(item.target ?? '')
    const weight = Number(item.weight ?? item.label ?? 1)
    if (!ids.has(source) || !ids.has(target) || !Number.isFinite(weight)) throw new Error('Nieprawidłowe końce lub waga krawędzi')
    return { source, target, weight }
  })
  return { vertices, links, directed: obj.directed }
}

export function runAlgorithm(graph: Graph, algorithm: Algorithm, start: string, end: string): Run {
  const began = performance.now()
  const steps: Step[] = []
  const order: string[] = []
  const visited = new Set<string>()
  const parent = new Map<string, string>()
  let operations = 0
  let distance: number | null = null
  let error: string | undefined
  const adjacency = new Map<string, { to: string; weight: number }[]>(graph.vertices.map(v => [v, []]))
  for (const e of graph.links) {
    adjacency.get(e.source)?.push({ to: e.target, weight: e.weight })
    if (!graph.directed) adjacency.get(e.target)?.push({ to: e.source, weight: e.weight })
  }
  const capture = (current: string | null, frontier: string[], message: string, activeEdge?: string) => {
    steps.push({ current, visited: [...visited], frontier: [...frontier], message, activeEdge })
  }
  if (!adjacency.has(start) || !adjacency.has(end)) throw new Error('Wybierz poprawne wierzchołki')
  if (algorithm === 'dijkstra' && graph.links.some(e => e.weight < 0)) throw new Error('Dijkstra nie obsługuje ujemnych wag')
  capture(null, [start], `Rozpoczęcie algorytmu ${algorithm.toUpperCase()} od ${start}`)
  if (algorithm === 'bfs' || algorithm === 'dfs') {
    const frontier = [start]
    const discovered = new Set([start])
    while (frontier.length) {
      const v = algorithm === 'bfs' ? frontier.shift()! : frontier.pop()!
      if (visited.has(v)) continue
      visited.add(v); order.push(v)
      capture(v, frontier, `Odwiedzono wierzchołek ${v}`)
      if (v === end) break
      const neighbors = adjacency.get(v)!
      const sequence = algorithm === 'dfs' ? [...neighbors].reverse() : neighbors
      for (const { to } of sequence) {
        operations++
        if (!discovered.has(to)) {
          discovered.add(to); parent.set(to, v); frontier.push(to)
          capture(v, frontier, `Odkryto ${to} z ${v}`, `${v}|${to}`)
        }
      }
    }
  } else if (algorithm === 'dijkstra') {
    const dist = new Map(graph.vertices.map(v => [v, Infinity]))
    dist.set(start, 0)
    while (visited.size < graph.vertices.length) {
      let v: string | undefined
      let best = Infinity
      for (const candidate of graph.vertices) {
        operations++
        if (!visited.has(candidate) && dist.get(candidate)! < best) { best = dist.get(candidate)!; v = candidate }
      }
      if (!v) break
      visited.add(v); order.push(v)
      capture(v, [], `Ustalono odległość do ${v}: ${best}`)
      if (v === end) break
      for (const { to, weight } of adjacency.get(v)!) {
        operations++
        const candidate = best + weight
        if (candidate < dist.get(to)!) {
          dist.set(to, candidate); parent.set(to, v)
          capture(v, [to], `Relaksacja ${v} → ${to}: ${candidate}`, `${v}|${to}`)
        }
      }
    }
    distance = Number.isFinite(dist.get(end)!) ? dist.get(end)! : null
  } else {
    const dist = new Map(graph.vertices.map(v => [v, Infinity]))
    dist.set(start, 0)
    const arcs = [...graph.links, ...(!graph.directed ? graph.links.map(e => ({ source: e.target, target: e.source, weight: e.weight })) : [])]
    for (let i = 1; i < graph.vertices.length; i++) {
      let changed = false
      for (const { source, target, weight } of arcs) {
        operations++
        if (Number.isFinite(dist.get(source)!) && dist.get(source)! + weight < dist.get(target)!) {
          dist.set(target, dist.get(source)! + weight); parent.set(target, source); changed = true
          if (!visited.has(source)) { visited.add(source); order.push(source) }
          capture(source, [target], `Iteracja ${i}: relaksacja ${source} → ${target}`, `${source}|${target}`)
        }
      }
      if (!changed) break
    }
    const affected = new Set<string>()
    for (const { source, target, weight } of arcs) {
      operations++
      if (Number.isFinite(dist.get(source)!) && dist.get(source)! + weight < dist.get(target)!) affected.add(target)
    }
    if (affected.size) {
      const queue = [...affected]
      for (let i = 0; i < queue.length; i++) for (const { to } of adjacency.get(queue[i])!) if (!affected.has(to)) { affected.add(to); queue.push(to) }
      if (affected.has(end)) error = 'Ujemny cykl osiągalny ze startu wpływa na wynik dla celu'
    }
    distance = Number.isFinite(dist.get(end)!) && !error ? dist.get(end)! : null
    if (!error && distance !== null && !visited.has(end)) { visited.add(end); order.push(end) }
  }
  const path: string[] = []
  if (!error && (start === end || parent.has(end))) {
    const seen = new Set<string>()
    let cursor: string | undefined = end
    while (cursor !== undefined && !seen.has(cursor)) {
      path.unshift(cursor); seen.add(cursor)
      if (cursor === start) break
      cursor = parent.get(cursor)
    }
    if (path[0] !== start) path.length = 0
  }
  if (algorithm === 'bfs' || algorithm === 'dfs') distance = path.length ? path.length - 1 : null
  capture(null, [], error ?? (path.length ? `Zakończono. Trasa: ${path.join(' → ')}` : 'Nie znaleziono ścieżki'))
  return { steps, order, path, distance, operations, durationMs: performance.now() - began, error }
}
