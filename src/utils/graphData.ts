import { MarkerType, type Edge, type Node } from '@xyflow/react'

export type GraphDocument = { nodes: Node[]; edges: Edge[]; directed: boolean }

const style = { width: 54, height: 54, borderRadius: '50%', background: '#283657', border: '2px solid #818cf8', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 700 }
const node = (id: string, x: number, y: number): Node => ({ id, position: { x, y }, data: { label: id }, style })
const edge = (source: string, target: string, weight: number, directed: boolean): Edge => ({
  id: `${source}-${target}`, source, target, label: String(weight), type: 'straight',
  style: { stroke: '#7c8ba7', strokeWidth: 2 },
  markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined,
  labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 12 },
  labelBgStyle: { fill: '#17243a', fillOpacity: 1 }, labelBgPadding: [6, 4], labelBgBorderRadius: 5,
})
export function sampleGraph(): GraphDocument {
  const directed = true
  return {
    directed,
    nodes: [node('A', 60, 180), node('B', 260, 45), node('C', 260, 305), node('D', 490, 55), node('E', 490, 290), node('F', 710, 170)],
    edges: [edge('A', 'B', 4, directed), edge('A', 'C', 2, directed), edge('B', 'C', 1, directed), edge('B', 'D', 5, directed), edge('C', 'E', 3, directed), edge('D', 'E', 1, directed), edge('D', 'F', 2, directed), edge('E', 'F', 4, directed)],
  }
}
export function generateRandomGraph(count: number, density: number, directed: boolean): GraphDocument {
  const n = Math.max(2, Math.min(100, Math.floor(count)))
  const nodes: Node[] = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n
    return node(`V${i + 1}`, 350 + 270 * Math.cos(angle), 290 + 240 * Math.sin(angle))
  })
  const edges: Edge[] = []
  const seen = new Set<string>()
  const add = (a: number, b: number) => {
    const key = directed ? `${a}:${b}` : `${Math.min(a, b)}:${Math.max(a, b)}`
    if (a === b || seen.has(key)) return
    seen.add(key); edges.push(edge(nodes[a].id, nodes[b].id, 1 + Math.floor(Math.random() * 20), directed))
  }
  // Najpierw zapewniamy spójność grafu w sensie nieskierowanym.
  for (let i = 1; i < n; i++) add(i - 1, i)
  for (let i = 0; i < n; i++) for (let j = directed ? 0 : i + 1; j < n; j++) {
    if (i !== j && Math.random() < density) add(i, j)
  }
  return { nodes, edges, directed }
}
