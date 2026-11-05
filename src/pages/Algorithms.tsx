import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { ArrowLeft, ArrowRight, GitBranch, Play, Upload } from 'lucide-react'
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
import { ALGORITHM_GUIDES } from '../utils/demoScenarios'
import { sampleGraph } from '../utils/graphData'
import AlgorithmPlayer from '../visualization/AlgorithmPlayer'
import InsightPanel from '../visualization/InsightPanel'
import { useStepPlayer } from '../visualization/useStepPlayer'
import {
  clearOpenInAlgorithmsFlag,
  loadWorkspace,
  loadWorkspaceMeta,
  saveWorkspace,
  type WorkspaceGraph,
} from '../workspace/graphWorkspace'
import { describeUnreachable, validateGraphForAlgorithm } from '../workspace/validateAlgorithm'
import './Algorithms.css'

const names: Record<Algorithm, string> = {
  bfs: 'BFS',
  dfs: 'DFS',
  dijkstra: 'Dijkstra',
  bellman: 'Bellman–Ford',
}

type Saved = {
  nodes: Array<{ id: string; position?: { x: number; y: number } }>
  edges: Array<{ source: string; target: string; weight?: number; label?: string }>
  directed: boolean
}

function workspaceToSaved(doc: WorkspaceGraph): Saved {
  return {
    directed: doc.directed,
    nodes: doc.nodes.map(n => ({ id: n.id, position: n.position })),
    edges: doc.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight })),
  }
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

function defaultDemo(): { document: Saved; start: string; end: string; notice: string; demoId: DemoGraphId | 'custom' } {
  const sample = sampleGraph()
  return {
    demoId: 'weighted',
    start: 'A',
    end: 'F',
    notice: 'Wczytano graf ważony. Uruchom BFS, DFS lub Dijkstrę, aby zobaczyć szczegółową animację.',
    document: {
      directed: sample.directed,
      nodes: sample.nodes.map(n => ({ id: n.id, position: n.position })),
      edges: sample.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })),
    },
  }
}

function bootFromEditor(): { document: Saved; start: string; end: string; notice: string; demoId: DemoGraphId | 'custom' } | null {
  const workspace = loadWorkspace()
  if (!workspace || workspace.nodes.length === 0) return null
  clearOpenInAlgorithmsFlag()
  return {
    demoId: 'custom',
    document: workspaceToSaved(workspace),
    start: workspace.start && workspace.nodes.some(n => n.id === workspace.start)
      ? workspace.start
      : workspace.nodes[0].id,
    end: workspace.end && workspace.nodes.some(n => n.id === workspace.end)
      ? workspace.end
      : workspace.nodes.at(-1)!.id,
    notice: `Wczytano graf z edytora (${workspace.nodes.length} wierzchołków, ${workspace.edges.length} krawędzi). Rozmieszczenie zostało zachowane.`,
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

function bootFromScenario(scenario: string | null): {
  document: Saved
  start: string
  end: string
  notice: string
  demoId: DemoGraphId | 'custom'
  algorithm: Algorithm
} | null {
  if (scenario === 'dijkstra') {
    const demo = DEMO_GRAPHS.find(item => item.id === 'weighted')!
    const built = toSaved(demo.build())
    return {
      demoId: 'weighted',
      document: built,
      start: demo.start,
      end: demo.end,
      algorithm: 'dijkstra',
      notice: 'Scenariusz B: Dijkstra na grafie ważonym. Uruchom algorytm i obserwuj relaksacje oraz ścieżkę do F.',
    }
  }
  if (scenario === 'bellman') {
    const demo = DEMO_GRAPHS.find(item => item.id === 'negative')!
    const built = toSaved(demo.build())
    return {
      demoId: 'negative',
      document: built,
      start: demo.start,
      end: demo.end,
      algorithm: 'bellman',
      notice: 'Scenariusz C: Bellman–Ford z ujemną wagą B→C (−3), bez ujemnego cyklu. Uruchom i śledź relaksacje.',
    }
  }
  if (scenario === 'bfs-dfs') {
    const demo = DEMO_GRAPHS.find(item => item.id === 'branched')!
    const built = toSaved(demo.build())
    return {
      demoId: 'branched',
      document: built,
      start: demo.start,
      end: demo.end,
      algorithm: 'bfs',
      notice: 'Scenariusz A (pojedynczy widok): graf rozgałęziony. Dla pełnego BFS vs DFS użyj modułu Porównanie.',
    }
  }
  return null
}

export default function Algorithms() {
  const location = useLocation()
  const scenario = new URLSearchParams(location.search).get('scenario')
  const openedFromEditor = Boolean((location.state as { fromEditor?: boolean } | null)?.fromEditor)
    || Boolean(loadWorkspaceMeta()?.openInAlgorithms)
  const scenarioBoot = !openedFromEditor ? bootFromScenario(scenario) : null
  const boot = openedFromEditor ? bootFromEditor() : null
  const initial = boot ?? scenarioBoot ?? defaultDemo()

  const [document, setDocument] = useState<Saved>(initial.document)
  const [algorithm, setAlgorithm] = useState<Algorithm>(scenarioBoot?.algorithm ?? 'bfs')
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [demoId, setDemoId] = useState<DemoGraphId | 'custom'>(initial.demoId)
  const [run, setRun] = useState<Run | null>(null)
  const [notice, setNotice] = useState(initial.notice)
  const [hints, setHints] = useState<string[]>([])
  const player = useStepPlayer()
  const { bind, seek } = player
  const guide = ALGORITHM_GUIDES[algorithm]

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
      const workspace = loadWorkspace()
      if (!workspace || workspace.nodes.length === 0) {
        setNotice('Najpierw zapisz lub wyślij graf z zakładki Edytor grafów.')
        return
      }
      const checked = fromEditor(workspace)
      setDocument(workspaceToSaved(workspace))
      setStart(workspace.start && checked.vertices.includes(workspace.start) ? workspace.start : checked.vertices[0] ?? '')
      setEnd(workspace.end && checked.vertices.includes(workspace.end) ? workspace.end : checked.vertices.at(-1) ?? '')
      setDemoId('custom')
      setRun(null)
      setHints([])
      setNotice('Wczytano graf zapisany w edytorze. Rozmieszczenie wierzchołków zostało zachowane.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nie udało się wczytać grafu')
    }
  }

  const loadDemo = (id: DemoGraphId) => {
    const demo = DEMO_GRAPHS.find(item => item.id === id)
    if (!demo) return
    const built = demo.build()
    const saved = toSaved(built)
    setDocument(saved)
    setStart(demo.start)
    setEnd(demo.end)
    setDemoId(id)
    setRun(null)
    setHints([])
    setNotice(`Wczytano przykład: ${demo.label}. ${demo.description}`)
    saveWorkspace({
      version: 1,
      directed: saved.directed,
      nodes: saved.nodes.map(n => ({ id: n.id, position: n.position ?? { x: 0, y: 0 } })),
      edges: saved.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.weight ?? 1) })),
      start: demo.start,
      end: demo.end,
    }, { source: 'demo' })
  }

  const execute = () => {
    const validation = validateGraphForAlgorithm(graph, algorithm, start, end)
    if (!validation.ok) {
      setRun(null)
      setHints(validation.messages)
      setNotice(`${validation.title}. ${validation.messages[0] ?? ''}`)
      return
    }
    try {
      const result = runAlgorithm(graph, algorithm, start, end)
      setRun(result)
      const unreachable = describeUnreachable(graph, result.reachable, start)
      const base = result.error
        ?? `Obliczenia z przygotowaniem ${result.steps.length} kroków wizualizacji: ${result.durationMs.toFixed(3)} ms (bez pauz odtwarzania), ${result.examinedEdges} analizowanych krawędzi, ${result.reachable.length} osiągalnych wierzchołków.`
      setNotice(unreachable ? `${base} ${unreachable}` : base)
      setHints([
        ...validation.messages,
        ...(unreachable ? [unreachable] : []),
      ])
    } catch (error) {
      setRun(null)
      setHints([])
      setNotice(error instanceof Error ? error.message : 'Nie udało się uruchomić algorytmu. Sprawdź graf i spróbuj ponownie.')
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
            Krokowa prezentacja BFS, DFS, Dijkstry i Bellmana–Forda: opisy decyzji, pseudokod,
            historia operacji oraz struktury danych. Najpierw wybierz algorytm lub przykład, potem kliknij „Uruchom algorytm”.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/editor" className="btn btn-outline">
            <ArrowLeft size={15} /> Wróć do edytora
          </Link>
          <span className="version-pill">Tryb edukacyjny</span>
        </div>
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
            <div className="algo-hints">
              <strong>Zastosowanie</strong>
              <p>{guide.use}</p>
              <strong>Ograniczenia</strong>
              <p>{guide.limits}</p>
            </div>
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
            <Link className="algo-btn" to="/editor">
              <ArrowLeft size={16} /> Edytuj ten graf
            </Link>
            <div className="algo-summary">
              <strong>Graf</strong>
              <span>{graph.vertices.length} wierzchołków</span>
              <span>{graph.links.length} krawędzi</span>
              <span>{graph.directed ? 'Skierowany' : 'Nieskierowany'}</span>
              <span>{demoId === 'custom' ? 'Źródło: edytor' : 'Źródło: przykład'}</span>
            </div>
            {hints.length > 0 && (
              <div className="algo-hints">
                <strong>Podpowiedzi</strong>
                {hints.map(hint => <p key={hint}>{hint}</p>)}
              </div>
            )}
            <div className="algo-legend">
              <span><i className="algo-dot algo-dot-active" /> bieżący</span>
              <span><i className="algo-dot algo-dot-frontier" /> w strukturze</span>
              <span><i className="algo-dot algo-dot-visited" /> odwiedzony</span>
              <span><i className="algo-dot algo-dot-path" /> ścieżka wyniku</span>
            </div>
            <p className="algo-note">
              BFS/DFS: kolejność odwiedzin (bez wag). Dijkstra: wagi nieujemne. Bellman–Ford: także wagi ujemne i wykrywanie ujemnego cyklu.
              Pętle i krawędzie równoległe są zablokowane w edytorze.
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
          <small>Czas z przygotowaniem kroków</small>
          <strong>{run ? `${run.durationMs.toFixed(3)} ms` : '—'}</strong>
        </div>
      </div>

      <div className="panel algo-detail">
        <h3>Wynik i kolejność odwiedzin</h3>
        <p><b>Ścieżka do celu:</b> {displayPath.length ? displayPath.join(' → ') : 'Brak wyznaczonej trasy'}</p>
        <p><b>Kolejność odwiedzin:</b> {run?.order.join(' → ') || '—'}</p>
        <p><b>Zbiór osiągalny:</b> {run?.reachable.join(', ') || '—'}</p>
        <p className="algo-note">
          Podany czas obejmuje wykonanie algorytmu edukacyjnego wraz z budową listy kroków wizualizacji
          (`performance.now`), ale bez pauz odtwarzania. To nie jest czysty czas z modułu Eksperymenty
          (tam Dijkstra używa kopca, a BFS/DFS nie zapisują kroków). Kroki animacji ≠ operacje benchmarku.
        </p>
        <Link to="/editor" className="algo-editor-link">
          Wróć do edytora bez utraty danych <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}
