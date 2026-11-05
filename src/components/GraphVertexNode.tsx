import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'

export type GraphVertexData = {
  label: string
}

export type GraphVertexFlowNode = Node<GraphVertexData, 'graphVertex'>

const HANDLES: Array<{ id: string; position: Position; title: string }> = [
  { id: 'top', position: Position.Top, title: 'Uchwyt górny' },
  { id: 'right', position: Position.Right, title: 'Uchwyt prawy' },
  { id: 'bottom', position: Position.Bottom, title: 'Uchwyt dolny' },
  { id: 'left', position: Position.Left, title: 'Uchwyt lewy' },
]

/** Circular editor vertex with four bidirectional connection handles (Loose mode). */
function GraphVertexNode({ data, selected }: NodeProps<GraphVertexFlowNode>) {
  return (
    <div className={`ge-vertex${selected ? ' is-selected' : ''}`} title={data.label}>
      <span className="ge-vertex-label">{data.label}</span>
      {HANDLES.map(handle => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="ge-handle"
          isConnectable
          title={handle.title}
        >
          <span className="ge-handle-dot" aria-hidden />
        </Handle>
      ))}
    </div>
  )
}

export default memo(GraphVertexNode)
