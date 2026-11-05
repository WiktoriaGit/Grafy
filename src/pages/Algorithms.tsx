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
import GraphCalloutsOverlay from '../visualization/GraphCalloutsOverlay'
import { calloutsFromStep } from '../visualization/graphCallouts'
import { useStepPlayer } from '../visualization/useStepPlayer'
import {
  clearOpenInAlgorithmsFlag,
  loadWorkspace,
  loadWorkspaceMeta,
  saveWorkspace,
  type WorkspaceGraph,
} from '../workspace/graphWorkspace'
import { describeUnreachable, validateGraphForAlgorithm } from '../workspace/validateAlgorithm'
import GraphLibraryPanel from '../components/GraphLibraryPanel'
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
  const [showGraphCallouts, setShowGraphCallouts] = useState(true)
  const player = useStepPlayer()
  const { bind, seek } = player
  const guide = ALGORITHM_GUIDES[algorithm]

  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const step = run?.steps[player.index]
  const graphCallouts = useMemo(() => calloutsFromStep(step), [step])
  const showDistances = algorithm === 'dijkstra' || algorithm === 'bellman'
  const structureKind = run?.structureKind
    ?? (algorithm === 'bfs' ? 'queue' : algorithm === 'dfs' ? 'stack' : algorithm === 'dijkstra' ? 'priority' : 'none')

  const displayPath = useMemo(() => {
    if (!run || run.error) return [] as string[]
    return pathFromParents(run.start, end, run.parents)
  }, [run, end])

  const displayDistance = useMemo(() => {
    if (!run || run.error) return null as number | null
    if (algorithm === 'dfs') return null
    if (algorithm === 'dijkstra' || algorithm === 'bellman') return distanceFromMap(end, run.distances)
    // BFS: koszt = liczba krawędzi na ścieżce w drzewie BFS
    return displayPath.length ? displayPath.length - 1 : null
  }, [run, algorithm, end, displayPath])

  const showPath = !!run && player.isLast && algorithm !== 'dfs'

  const resultRows = useMemo(() => {
    if (!run) return [] as Array<{
      id: string
      cost: string
      parent: string
      reachable: boolean
      isTarget: boolean
    }>
    return graph.vertices.map(id => {
      const reachable = id === run.start || run.reachable.includes(id)
      let cost = '—'
      if (algorithm === 'dfs') {
        cost = reachable ? 'n/d' : '∞'
      } else if (algorithm === 'bfs') {
        const path = pathFromParents(run.start, id, run.parents)
        cost = path.length ? String(path.length - 1) : '∞'
      } else if (run.error) {
        cost = reachable ? formatDistance(run.distances[id]) : '∞'
      } else {
        cost = formatDistance(run.distances[id])
      }
      return {
        id,
        cost,
        parent: run.parents[id] ?? '—',
        reachable,
        isTarget: id === end,
      }
    })
  }, [run, graph.vertices, algorithm, end])

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
    if (!run) return
    if (run.error) {
      setNotice(`Wynik jest nieważny z powodu błędu algorytmu (${run.error}). Zmiana celu nie odtwarza wiarygodnej ścieżki.`)
      return
    }
    if (algorithm === 'dfs') {
      const path = pathFromParents(run.start, value, run.parents)
      setNotice(
        path.length
          ? `Cel ${value}: ścieżka w drzewie DFS ${path.join(' → ')} — to NIE jest gwarantowana najkrótsza droga.`
          : `Wierzchołek ${value} nie należy do drzewa przeszukiwania DFS ze startu ${run.start}.`,
      )
      return
    }
    if (!run.reachable.includes(value) && value !== run.start) {
      setNotice(`Wierzchołek ${value} jest nieosiągalny ze startu ${run.start}.`)
      return
    }
    const path = pathFromParents(run.start, value, run.parents)
    const distance = algorithm === 'dijkstra' || algorithm === 'bellman'
      ? distanceFromMap(value, run.distances)
      : path.length ? path.length - 1 : null
    const kind = algorithm === 'bfs' ? 'Najkrótsza ścieżka (liczba krawędzi)' : 'Najkrótsza ścieżka wagowa'
    setNotice(
      path.length
        ? `${kind} do ${value}: ${path.join(' → ')}${distance !== null ? ` (koszt ${formatDistance(distance)})` : ''}. Bez ponownego uruchamiania algorytmu.`
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

  const targetOptions = run
    ? graph.vertices.filter(v => v === run.start || run.reachable.includes(v) || algorithm === 'dfs')
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
              {algorithm === 'dfs'
                ? 'Cel w drzewie DFS (nie najkrótsza droga)'
                : algorithm === 'bfs'
                  ? 'Cel najkrótszej ścieżki (liczba krawędzi)'
                  : 'Cel najkrótszej ścieżki'}
              <select value={end} onChange={e => changeEnd(e.target.value)}>
                {targetOptions.map(vertex => <option key={vertex}>{vertex}</option>)}
              </select>
            </label>
            {run && !run.error && algorithm !== 'dfs' && (
              <p className="algo-note">
                Po eksploracji możesz zmieniać cel (lista lub kliknięcie wierzchołka na grafie)
                bez ponownego uruchamiania — ścieżka pochodzi z tablicy poprzedników.
              </p>
            )}
            {algorithm === 'dfs' && (
              <p className="algo-note">
                DFS nie wyznacza najkrótszej drogi. Pokazujemy tylko drzewo przeszukiwania i kolejność odwiedzin.
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
            <GraphLibraryPanel
              compact
              currentGraph={null}
              title="Biblioteka grafów"
              onLoad={entry => {
                saveWorkspace(entry.graph, { source: 'file', openInAlgorithms: true })
                setDocument(workspaceToSaved(entry.graph))
                setStart(entry.graph.start && entry.graph.nodes.some(n => n.id === entry.graph.start)
                  ? entry.graph.start
                  : entry.graph.nodes[0]?.id ?? '')
                setEnd(entry.graph.end && entry.graph.nodes.some(n => n.id === entry.graph.end)
                  ? entry.graph.end
                  : entry.graph.nodes.at(-1)?.id ?? '')
                setDemoId('custom')
                setRun(null)
                setNotice(`Wczytano z biblioteki: ${entry.name}.`)
              }}
            />
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
            <label className="algo-check">
              <input
                type="checkbox"
                checked={showGraphCallouts}
                onChange={e => setShowGraphCallouts(e.target.checked)}
              />
              <span>Pokazuj wyjaśnienia na grafie</span>
            </label>
            <p className="algo-note">
              BFS/DFS: kolejność odwiedzin (bez wag). Dijkstra: wagi nieujemne. Bellman–Ford: także wagi ujemne i wykrywanie ujemnego cyklu.
              Pętle i krawędzie równoległe są zablokowane w edytorze. Okienka na grafie uzupełniają panel boczny.
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
              onNodeClick={(_, node) => {
                if (!run || !player.isLast) return
                changeEnd(node.id)
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155" />
              <Controls showInteractive={false} />
              <GraphCalloutsOverlay callouts={graphCallouts} enabled={showGraphCallouts} />
            </ReactFlow>
          </div>
          <AlgorithmPlayer player={player} disabled={!run} />
          <div className="algo-message">
            <strong>{step?.title ?? 'Gotowe'}</strong>
            <span>{step?.message ?? notice}</span>
            {step?.reason && (
              <small className="algo-why"><b>Dlaczego?</b> {step.reason}</small>
            )}
            {step?.detail && (
              <small className="algo-where">{step.detail}</small>
            )}
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
          <small>Krok</small>
          <strong>{run ? `${player.index + 1} z ${run.steps.length}` : '—'}</strong>
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
        <h3>Wynik i odległości od źródła</h3>
        <p>
          <b>
            {algorithm === 'dfs' ? 'Ścieżka w drzewie DFS:' : 'Ścieżka do celu:'}
          </b>{' '}
          {displayPath.length ? displayPath.join(' → ') : 'Brak wyznaczonej trasy'}
          {displayDistance !== null ? ` (koszt ${formatDistance(displayDistance)})` : ''}
        </p>
        <p><b>Kolejność odwiedzin:</b> {run?.order.join(' → ') || '—'}</p>
        <p>
          <b>Osiągalne:</b> {run?.reachable.join(', ') || '—'}
          {run && graph.vertices.some(v => v !== run.start && !run.reachable.includes(v)) && (
            <>
              {' · '}
              <b>Nieosiągalne:</b>{' '}
              {graph.vertices.filter(v => v !== run.start && !run.reachable.includes(v)).join(', ')}
            </>
          )}
        </p>
        {run && (
          <div className="algo-table-wrap algo-result-table-wrap">
            <table className="algo-state-table">
              <thead>
                <tr>
                  <th>v</th>
                  <th>{algorithm === 'bfs' ? 'd(v) krawędzie' : algorithm === 'dfs' ? 'koszt' : 'd(v)'}</th>
                  <th>π(v)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map(row => (
                  <tr
                    key={row.id}
                    className={`${row.isTarget ? 'is-current' : ''} ${!row.reachable ? 'is-unreachable' : ''}`}
                  >
                    <td>
                      <button
                        type="button"
                        className="algo-vertex-pick"
                        onClick={() => changeEnd(row.id)}
                        disabled={!run || !!run.error}
                        title="Ustaw jako cel i podświetl ścieżkę"
                      >
                        {row.id}
                      </button>
                    </td>
                    <td>{row.cost}</td>
                    <td>{row.parent}</td>
                    <td>{row.reachable ? (row.isTarget ? 'cel' : 'osiągalny') : 'nieosiągalny'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="algo-note">
          {algorithm === 'dfs'
            ? 'DFS: kolumna kosztu jest celowo oznaczona jako n/d — algorytm nie rozwiązuje problemu najkrótszej drogi.'
            : algorithm === 'bfs'
              ? 'BFS: d(v) to liczba krawędzi na najkrótszej ścieżce nieważonej od źródła.'
              : 'Dijkstra/Bellman–Ford: d(v) to najkrótszy koszt wagowy od źródła do wszystkich osiągalnych wierzchołków.'}
          {' '}Czas obejmuje przygotowanie kroków wizualizacji — nie porównuj go z benchmarkiem w Eksperymentach.
        </p>
        <Link to="/editor" className="algo-editor-link">
          Wróć do edytora bez utraty danych <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}
