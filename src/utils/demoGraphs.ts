import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { GraphDocument } from './graphData'

const style = {
  width: 54,
  height: 54,
  borderRadius: '50%',
  background: '#283657',
  border: '2px solid #818cf8',
  color: '#fff',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontWeight: 700,
}

const node = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  data: { label: id },
  style,
})

const edge = (source: string, target: string, weight: number, directed: boolean): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  label: String(weight),
  type: 'straight',
  style: { stroke: '#7c8ba7', strokeWidth: 2 },
  markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined,
  labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 12 },
  labelBgStyle: { fill: '#17243a', fillOpacity: 1 },
  labelBgPadding: [6, 4],
  labelBgBorderRadius: 5,
})

export type DemoGraphId = 'simple' | 'branched' | 'cycle' | 'disconnected' | 'weighted'

export type DemoGraphOption = {
  id: DemoGraphId
  label: string
  description: string
  start: string
  end: string
  build: () => GraphDocument
}

export const DEMO_GRAPHS: DemoGraphOption[] = [
  {
    id: 'simple',
    label: 'Prosty łańcuch',
    description: 'Nieskierowany łańcuch A–B–C–D — dobra baza do BFS/DFS.',
    start: 'A',
    end: 'D',
    build: () => {
      const directed = false
      return {
        directed,
        nodes: [node('A', 80, 180), node('B', 260, 180), node('C', 440, 180), node('D', 620, 180)],
        edges: [
          edge('A', 'B', 1, directed),
          edge('B', 'C', 1, directed),
          edge('C', 'D', 1, directed),
        ],
      }
    },
  },
  {
    id: 'branched',
    label: 'Rozgałęziony',
    description: 'Drzewo z kilkoma gałęziami — widać różnicę kolejki i stosu.',
    start: 'A',
    end: 'G',
    build: () => {
      const directed = true
      return {
        directed,
        nodes: [
          node('A', 320, 40),
          node('B', 160, 160),
          node('C', 480, 160),
          node('D', 80, 300),
          node('E', 240, 300),
          node('F', 400, 300),
          node('G', 560, 300),
        ],
        edges: [
          edge('A', 'B', 1, directed),
          edge('A', 'C', 1, directed),
          edge('B', 'D', 1, directed),
          edge('B', 'E', 1, directed),
          edge('C', 'F', 1, directed),
          edge('C', 'G', 1, directed),
        ],
      }
    },
  },
  {
    id: 'cycle',
    label: 'Z cyklem',
    description: 'Graf z cyklem — pokazuje, że odkryte wierzchołki nie wracają do struktury.',
    start: 'A',
    end: 'D',
    build: () => {
      const directed = false
      return {
        directed,
        nodes: [
          node('A', 180, 80),
          node('B', 420, 80),
          node('C', 420, 260),
          node('D', 180, 260),
          node('E', 300, 170),
        ],
        edges: [
          edge('A', 'B', 1, directed),
          edge('B', 'C', 1, directed),
          edge('C', 'D', 1, directed),
          edge('D', 'A', 1, directed),
          edge('A', 'E', 1, directed),
          edge('E', 'C', 1, directed),
        ],
      }
    },
  },
  {
    id: 'disconnected',
    label: 'Niespójny',
    description: 'Dwie składowe — eksploracja obejmuje tylko osiągalne ze startu.',
    start: 'A',
    end: 'F',
    build: () => {
      const directed = false
      return {
        directed,
        nodes: [
          node('A', 100, 120),
          node('B', 260, 60),
          node('C', 260, 200),
          node('D', 480, 120),
          node('E', 640, 60),
          node('F', 640, 200),
        ],
        edges: [
          edge('A', 'B', 1, directed),
          edge('A', 'C', 1, directed),
          edge('B', 'C', 1, directed),
          edge('D', 'E', 1, directed),
          edge('D', 'F', 1, directed),
        ],
      }
    },
  },
  {
    id: 'weighted',
    label: 'Ważony (Dijkstra)',
    description: 'Klasyczny graf ważony — widać relaksacje i wybór najtańszej ścieżki.',
    start: 'A',
    end: 'F',
    build: () => {
      const directed = true
      return {
        directed,
        nodes: [
          node('A', 60, 180),
          node('B', 260, 45),
          node('C', 260, 305),
          node('D', 490, 55),
          node('E', 490, 290),
          node('F', 710, 170),
        ],
        edges: [
          edge('A', 'B', 4, directed),
          edge('A', 'C', 2, directed),
          edge('B', 'C', 1, directed),
          edge('B', 'D', 5, directed),
          edge('C', 'E', 3, directed),
          edge('D', 'E', 1, directed),
          edge('D', 'F', 2, directed),
          edge('E', 'F', 4, directed),
        ],
      }
    },
  },
]
