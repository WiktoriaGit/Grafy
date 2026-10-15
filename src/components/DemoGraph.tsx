
import { useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react'

const initialNodes: Node[] = [
  { id: 'A', position: { x: 70, y: 150 }, data: { label: 'A' }, type: 'default' },
  { id: 'B', position: { x: 260, y: 50 }, data: { label: 'B' }, type: 'default' },
  { id: 'C', position: { x: 260, y: 250 }, data: { label: 'C' }, type: 'default' },
  { id: 'D', position: { x: 470, y: 80 }, data: { label: 'D' }, type: 'default' },
  { id: 'E', position: { x: 470, y: 260 }, data: { label: 'E' }, type: 'default' },
  { id: 'F', position: { x: 680, y: 155 }, data: { label: 'F' }, type: 'default' },
]

const connections = [
  ['A', 'B', 4],
  ['A', 'C', 2],
  ['B', 'D', 5],
  ['B', 'C', 1],
  ['C', 'E', 3],
  ['D', 'F', 2],
  ['E', 'F', 4],
  ['D', 'E', 1],
] as const

const pathEdges = new Set(['A-C', 'C-E', 'E-F'])

const initialEdges: Edge[] = connections.map(([source, target, weight]) => {
  const active = pathEdges.has(`${source}-${target}`)

  return {
    id: `${source}-${target}`,
    source,
    target,
    label: String(weight),
    type: 'smoothstep',
    animated: active,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: active ? '#818cf8' : '#64748b',
    },
    style: {
      stroke: active ? '#818cf8' : '#475569',
      strokeWidth: active ? 2.8 : 1.7,
    },
    labelStyle: {
      fill: '#cbd5e1',
      fontSize: 12,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: '#172033',
      fillOpacity: 0.95,
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 5,
  }
})

export default function DemoGraph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const styledNodes = useMemo(() => nodes.map(node => {
    const onPath = ['A', 'C', 'E', 'F'].includes(node.id)

    return {
      ...node,
      style: {
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: onPath ? '#4f46e5' : '#1e293b',
        color: '#fff',
        border: `2px solid ${onPath ? '#a5b4fc' : '#475569'}`,
        boxShadow: onPath ? '0 0 25px rgba(99,102,241,.28)' : 'none',
        fontSize: 17,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    }
  }), [nodes])

  const nodeTypes = useMemo(() => ({}), [])

  const onInit = useCallback(() => {}, [])

  return (
    <div className="demo-graph">
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.4}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#334155"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="graph-legend">
        <span><i className="legend-dot legend-purple" /> Przykładowa ścieżka</span>
        <span><i className="legend-dot legend-gray" /> Pozostałe wierzchołki</span>
      </div>
    </div>
  )
}
