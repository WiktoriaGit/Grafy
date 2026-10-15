import type { Graph } from './graphAlgorithms'

export type MSTAlgorithm = 'prim' | 'kruskal'
export type MSTEdge = { source: string; target: string; weight: number; id: number }
export type MSTStep = { selected: number[]; considered: number | null; visited: string[]; message: string }
export type MSTResult = { steps: MSTStep[]; selected: MSTEdge[]; totalWeight: number; durationMs: number; connected: boolean; operations: number }

export function calculateMST(graph: Graph, algorithm: MSTAlgorithm, start?: string): MSTResult {
  if (graph.directed) throw new Error('Minimalne drzewo rozpinające wymaga grafu nieskierowanego. Zmień typ grafu w edytorze i zapisz go ponownie.')
  if (new Set(graph.vertices).size !== graph.vertices.length) throw new Error('Powtórzone identyfikatory wierzchołków.')
  if (!graph.vertices.length) throw new Error('Graf nie zawiera wierzchołków.')
  const vertices = new Set(graph.vertices)
  const edges: MSTEdge[] = graph.links.map((e, id) => ({ ...e, id }))
  for (const e of edges) if (!vertices.has(e.source) || !vertices.has(e.target) || !Number.isFinite(e.weight)) throw new Error('Niepoprawna krawędź.')
  const begun = performance.now()
  const steps: MSTStep[] = []
  const selected: MSTEdge[] = []
  const visited = new Set<string>()
  let operations = 0
  const record = (message: string, considered: number | null = null) => steps.push({ selected: selected.map(e => e.id), considered, visited: [...visited], message })
  if (algorithm === 'prim') {
    const root = start && vertices.has(start) ? start : graph.vertices[0]
    visited.add(root)
    record(`Start w wierzchołku ${root}.`)
    while (visited.size < graph.vertices.length) {
      let best: MSTEdge | undefined
      for (const e of edges) {
        operations++
        const crosses = visited.has(e.source) !== visited.has(e.target)
        if (crosses && (!best || e.weight < best.weight || (e.weight === best.weight && e.id < best.id))) best = e
      }
      if (!best) break
      record(`Rozpatrywana krawędź ${best.source}–${best.target}, waga ${best.weight}.`, best.id)
      selected.push(best)
      visited.add(best.source); visited.add(best.target)
      record(`Dodano krawędź ${best.source}–${best.target}.`)
    }
  } else {
    const parent = new Map(graph.vertices.map(v => [v, v]))
    const rank = new Map(graph.vertices.map(v => [v, 0]))
    const find = (v: string): string => { operations++; const p = parent.get(v)!; if (p !== v) parent.set(v, find(p)); return parent.get(v)! }
    const union = (a: string, b: string): boolean => {
      let x = find(a), y = find(b)
      if (x === y) return false
      if (rank.get(x)! < rank.get(y)!) [x, y] = [y, x]
      parent.set(y, x)
      if (rank.get(x) === rank.get(y)) rank.set(x, rank.get(x)! + 1)
      return true
    }
    record('Posortowano krawędzie według rosnących wag.')
    for (const e of [...edges].sort((a, b) => a.weight - b.weight || a.id - b.id)) {
      record(`Sprawdzanie ${e.source}–${e.target}, waga ${e.weight}.`, e.id)
      if (union(e.source, e.target)) {
        selected.push(e); visited.add(e.source); visited.add(e.target)
        record(`Dodano ${e.source}–${e.target} — bez utworzenia cyklu.`)
      } else record(`Pominięto ${e.source}–${e.target} — utworzyłaby cykl.`)
      if (selected.length === graph.vertices.length - 1) break
    }
  }
  const connected = selected.length === graph.vertices.length - 1
  const totalWeight = selected.reduce((sum, e) => sum + e.weight, 0)
  record(connected ? `Gotowe. MST ma wagę ${totalWeight}.` : `Graf jest niespójny. Wyznaczono las rozpinający o wadze ${totalWeight}.`)
  return { steps, selected, totalWeight, durationMs: performance.now() - begun, connected, operations }
}
