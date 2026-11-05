import { useEffect, useMemo, useState } from 'react'
import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { ArrowRight, GitBranch, Play, Upload } from 'lucide-react'
import {
  distanceFromMap,
  formatDistance,
  fromEditor,
  pathFromParents,
  runAlgorithm,
  type Algorithm,
  type Graph,
  type Run,
} from '../algorithms/graphAlgorithms'
import { DEMO_GRAPHS, type DemoGraphId } from '../utils/demoGraphs'
import { sampleGraph } from '../utils/graphData'
import AlgorithmPlayer from '../visualization/AlgorithmPlayer'
import InsightPanel from '../visualization/InsightPanel'
import { useStepPlayer } from '../visualization/useStepPlayer'
import './Algorithms.css'

const KEY = 'graphlab-editor-v1'
const names: Record<Algorithm, string> = {
  bfs: 'BFS',
  dfs: 'DFS',
  dijkstra: 'Dijkstra',
  bellman: 'Bellman–Ford',
}

const sample = sampleGraph()
const initial: Saved = {
  directed: sample.directed,
  nodes: sample.nodes.map(n => ({ id: n.id, position: n.position })),
  edges: sample.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })),
}

type Saved = {
  nodes: Array<{ id: string; position?: { x: number; y: number } }>
  edges: Array<{ source: string; target: string; weight?: number; label?: string }>
  directed: boolean
}

function toSaved(doc: { directed: boolean; nodes: Node[]; edges: Edge[] }): Saved {
  return {
    directed: doc.directed,
    nodes: doc.nodes.map(n => ({ id: n.id, position: n.position })),
    edges: doc.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: Number(e.label ?? 1),
    })),
  }
}

function edgeMatches(activeEdge: string | undefined, source: string, target: string, directed: boolean) {
  if (!activeEdge) return false
  if (activeEdge === `${source}|${target}`) return true
  return !directed && activeEdge === `${target}|${source}`
}

function pathUsesEdge(path: string[], source: string, target: string, directed: boolean) {
  return path.some((vertex, index) => {
    if (index === 0) return false
    const prev = path[index - 1]
    return (prev === source && vertex === target) || (!directed && prev === target && vertex === source)
  })
}

export default function Algorithms() {
  const [document, setDocument] = useState<Saved>(initial)
  const [algorithm, setAlgorithm] = useState<Algorithm>('bfs')
  const [start, setStart] = useState('A')
  const [end, setEnd] = useState('F')
  const [demoId, setDemoId] = useState<DemoGraphId | 'custom'>('weighted')
  const [run, setRun] = useState<Run | null>(null)
  const [notice, setNotice] = useState('Wczytano graf ważony. Uruchom BFS, DFS lub Dijkstrę, aby zobaczyć szczegółową animację.')
  const player = useStepPlayer()
  const { bind, seek } = player

  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const step = run?.steps[player.index]
  const showDistances = algorithm === 'dijkstra' || algorithm === 'bellman'
  const structureKind = run?.structureKind
    ?? (algorithm === 'bfs' ? 'queue' : algorithm === 'dfs' ? 'stack' : algorithm === 'dijkstra' ? 'priority' : 'none')

  const displayPath = useMemo(() => {
    if (!run) return [] as string[]
    if (algorithm === 'bellman') return run.path
    return pathFromParents(run.start, end, run.parents)
  }, [run, algorithm, end])

  const displayDistance = useMemo(() => {
    if (!run) return null as number | null
    if (algorithm === 'dijkstra' || algorithm === 'bellman') return distanceFromMap(end, run.distances)
    return displayPath.length ? displayPath.length - 1 : null
  }, [run, algorithm, end, displayPath])

  const showPath = !!run && player.isLast

  useEffect(() => {
    bind(run?.steps.length ?? 0)
  }, [run, bind])

  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) {
        setNotice('Najpierw zapisz graf w zakładce Edytor grafów.')
        return
      }
      const parsed: unknown = JSON.parse(raw)
      const checked = fromEditor(parsed)
      setDocument(parsed as Saved)
      setStart(checked.vertices[0] ?? '')
      setEnd(checked.vertices.at(-1) ?? '')
      setDemoId('custom')
      setRun(null)
      setNotice('Wczytano graf zapisany w edytorze.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nie udało się wczytać grafu')
    }
  }

  const loadDemo = (id: DemoGraphId) => {
    const demo = DEMO_GRAPHS.find(item => item.id === id)
    if (!demo) return
    const built = demo.build()
    setDocument(toSaved(built))
    setStart(demo.start)
    setEnd(demo.end)
    setDemoId(id)
    setRun(null)
    setNotice(`Wczytano przykład: ${demo.label}. ${demo.description}`)
  }

  const execute = () => {
    try {
      const result = runAlgorithm(graph, algorithm, start, end)
      setRun(result)
      setNotice(
        result.error
          ?? `Obliczenia zakończone w ${result.durationMs.toFixed(3)} ms (bez animacji): ${result.steps.length} kroków animacji, ${result.examinedEdges} analizowanych krawędzi, ${result.reachable.length} osiągalnych wierzchołków.`,
      )
    } catch (error) {
      setRun(null)
      setNotice(error instanceof Error ? error.message : 'Błąd algorytmu')
    }
  }

  const changeAlgorithm = (value: Algorithm) => {
    setAlgorithm(value)
    setRun(null)
    setNotice(`Wybrano ${names[value]}. Uruchom algorytm, aby zobaczyć szczegółową animację.`)
  }

  const changeEnd = (value: string) => {
    setEnd(value)
    if (!run || algorithm === 'bellman') {
      setRun(null)
      return
    }
    if (!run.reachable.includes(value) && value !== run.start) {
      setNotice(`Wierzchołek ${value} nie jest osiągalny ze startu ${run.start} w zakończonej eksploracji.`)
      return
    }
    const path = pathFromParents(run.start, value, run.parents)
    const distance = algorithm === 'dijkstra'
      ? distanceFromMap(value, run.distances)
      : path.length ? path.length - 1 : null
    setNotice(
      path.length
        ? `Wybrano cel ${value}. Najkrótsza / odtworzona ścieżka: ${path.join(' → ')}${distance !== null ? ` (koszt ${formatDistance(distance)})` : ''}.`
        : `Brak ścieżki do ${value} w tablicy poprzedników.`,
    )
  }

  const nodes: Node[] = document.nodes.map((node, index) => {
    const active = step?.current === node.id
    const visited = step?.visited.includes(node.id) ?? false
    const inFrontier = step?.frontier.includes(node.id) ?? false
    const onPath = showPath && displayPath.includes(node.id)
    const background = onPath
      ? '#059669'
      : active
        ? '#7c3aed'
        : visited
          ? '#3730a3'
          : inFrontier
            ? '#1d4ed8'
            : '#24324c'
    const border = onPath
      ? '#6ee7b7'
      : active
        ? '#ddd6fe'
        : visited
          ? '#a5b4fc'
          : inFrontier
            ? '#93c5fd'
            : '#52647f'

    return {
      id: node.id,
      position: node.position ?? { x: 150 + index * 110, y: 150 },
      data: { label: node.id },
      style: {
        width: 56,
        height: 56,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        color: '#fff',
        background,
        border: `2px solid ${border}`,
        boxShadow: active ? '0 0 22px #8b5cf699' : inFrontier ? '0 0 16px #3b82f666' : 'none',
      },
    }
  })

  const edges: Edge[] = document.edges.map((edge, index) => {
    const highlighted = edgeMatches(step?.activeEdge, edge.source, edge.target, document.directed)
    const onPath = showPath && pathUsesEdge(displayPath, edge.source, edge.target, document.directed)
    const color = onPath ? '#34d399' : highlighted ? '#c4b5fd' : '#64748b'
    return {
      id: `algo-${index}`,
      source: edge.source,
      target: edge.target,
      label: String(edge.weight ?? edge.label ?? 1),
      type: 'straight',
      animated: !!highlighted,
      style: { stroke: color, strokeWidth: highlighted || onPath ? 3.5 : 1.8 },
      markerEnd: document.directed ? { type: MarkerType.ArrowClosed, color } : undefined,
      labelStyle: { fill: '#e2e8f0', fontWeight: 700 },
      labelBgStyle: { fill: '#17243a' },
    }
  })

  const targetOptions = run && algorithm !== 'bellman'
    ? graph.vertices.filter(v => v === run.start || run.reachable.includes(v))
    : graph.vertices

  return (
    <div className="page-container algo-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><GitBranch size={14} /> ALGORITHM EXPLORER</div>
          <h1>Wizualizacja algorytmów</h1>
          <p>
            Profesjonalna, krokowa prezentacja BFS, DFS i Dijkstry: opisy decyzji, pseudokod,
            historia operacji oraz struktury danych.
          </p>
        </div>
        <span className="version-pill">Tryb edukacyjny</span>
      </div>

      <div className="algo-workspace">
        <section className="panel algo-controls">
          <div className="panel-header"><h3>Konfiguracja</h3></div>
          <div className="algo-form">
            <label>
              Algorytm
              <select value={algorithm} onChange={e => changeAlgorithm(e.target.value as Algorithm)}>
                {Object.entries(names).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Przykładowy graf
              <select
                value={demoId}
                onChange={e => {
                  const value = e.target.value as DemoGraphId | 'custom'
                  if (value === 'custom') return
                  loadDemo(value)
                }}
              >
                <option value="custom" disabled={demoId !== 'custom'}>Własny / z edytora</option>
                {DEMO_GRAPHS.map(demo => (
                  <option key={demo.id} value={demo.id}>{demo.label}</option>
                ))}
              </select>
            </label>
            <label>
              Wierzchołek początkowy
              <select
                value={start}
                onChange={e => {
                  setStart(e.target.value)
                  setRun(null)
                }}
              >
                {graph.vertices.map(vertex => <option key={vertex}>{vertex}</option>)}
              </select>
            </label>
            <label>
              {algorithm === 'dijkstra' ? 'Cel najkrótszej ścieżki' : 'Cel ścieżki (z poprzedników)'}
              <select value={end} onChange={e => changeEnd(e.target.value)}>
                {targetOptions.map(vertex => <option key={vertex}>{vertex}</option>)}
              </select>
            </label>
            {algorithm === 'dijkstra' && run && (
              <p className="algo-note">
                Po pełnej eksploracji możesz zmieniać cel wśród osiągalnych wierzchołków
                bez ponownego uruchamiania algorytmu.
              </p>
            )}
            <button className="algo-btn algo-primary" onClick={execute}>
              <Play size={16} /> Uruchom algorytm
            </button>
            <button className="algo-btn" onClick={loadSaved}>
              <Upload size={16} /> Wczytaj z edytora
            </button>
            <div className="algo-summary">
              <strong>Graf</strong>
              <span>{graph.vertices.length} wierzchołków</span>
              <span>{graph.links.length} krawędzi</span>
              <span>{graph.directed ? 'Skierowany' : 'Nieskierowany'}</span>
            </div>
            <div className="algo-legend">
              <span><i className="algo-dot algo-dot-active" /> bieżący</span>
              <span><i className="algo-dot algo-dot-frontier" /> w strukturze</span>
              <span><i className="algo-dot algo-dot-visited" /> odwiedzony</span>
              <span><i className="algo-dot algo-dot-path" /> ścieżka wyniku</span>
            </div>
            <p className="algo-note">
              BFS i DFS pomijają wagi. Dijkstra wymaga wag nieujemnych i utrzymuje tablice d(v) oraz π(v).
              Bellman–Ford pozostaje dostępny; pełny panel edukacyjny dla niego będzie w kolejnym etapie.
            </p>
          </div>
        </section>

        <section className="panel algo-main">
          <div className="panel-header">
            <h3>Przebieg na grafie</h3>
            <span className="section-chip">{names[algorithm]}</span>
          </div>
          <div className="algo-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.28 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <AlgorithmPlayer player={player} disabled={!run} />
          <div className="algo-message">
            <strong>{step?.title ?? 'Gotowe'}</strong>
            <span>{step?.message ?? notice}</span>
          </div>
        </section>

        <InsightPanel
          algorithm={algorithm}
          step={step}
          steps={run?.steps ?? []}
          stepIndex={player.index}
          structureKind={structureKind}
          vertices={graph.vertices}
          notice={notice}
          showDistances={showDistances}
          onSelectStep={seek}
        />
      </div>

      <div className="algo-metrics">
        <div className="panel">
          <small>Kroki animacji</small>
          <strong>{run ? `${player.index + 1} / ${run.steps.length}` : '—'}</strong>
        </div>
        <div className="panel">
          <small>Analizowane krawędzie</small>
          <strong>{step?.examinedEdges ?? run?.examinedEdges ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Odwiedzone wierzchołki</small>
          <strong>{step?.visited.length ?? 0}</strong>
        </div>
        <div className="panel">
          <small>Osiągalne (wynik)</small>
          <strong>{run?.reachable.length ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Koszt do celu</small>
          <strong>{displayDistance ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Czas obliczeń (bez animacji)</small>
          <strong>{run ? `${run.durationMs.toFixed(3)} ms` : '—'}</strong>
        </div>
      </div>

      <div className="panel algo-detail">
        <h3>Wynik i kolejność odwiedzin</h3>
        <p><b>Ścieżka do celu:</b> {displayPath.length ? displayPath.join(' → ') : 'Brak wyznaczonej trasy'}</p>
        <p><b>Kolejność odwiedzin:</b> {run?.order.join(' → ') || '—'}</p>
        <p><b>Zbiór osiągalny:</b> {run?.reachable.join(', ') || '—'}</p>
        <p className="algo-note">
          Czas obliczeń mierzy wyłącznie wykonanie algorytmu (`performance.now`), bez opóźnień animacji.
          Historia i suwak służą wyłącznie do prezentacji wcześniej wyliczonych stanów.
        </p>
        <a href="/editor" className="algo-editor-link">
          Przejdź do edytora grafów <ArrowRight size={15} />
        </a>
      </div>
    </div>
  )
}
