import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Background, BackgroundVariant, Controls, ReactFlow } from '@xyflow/react'
import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  GitCompare,
  Info,
  Play,
  Upload,
} from 'lucide-react'
import { fromEditor, type Graph } from '../algorithms/graphAlgorithms'
import {
  buildPairWarnings,
  COMPARISON_ALGO_NAMES,
  isMstAlgorithm,
  METRIC_EXPLANATIONS,
  runComparison,
  sideStepCount,
  sideStepMessage,
  type ComparisonAlgoId,
  type ComparisonRun,
} from '../comparison/compareCore'
import {
  buildSideFlow,
  type SavedGraph,
} from '../comparison/flowBoard'
import { DEMO_GRAPHS, type DemoGraphId } from '../utils/demoGraphs'
import { sampleGraph } from '../utils/graphData'
import AlgorithmPlayer from '../visualization/AlgorithmPlayer'
import { useStepPlayer } from '../visualization/useStepPlayer'
import {
  clearOpenInComparisonFlag,
  loadWorkspace,
  loadWorkspaceMeta,
  type WorkspaceGraph,
} from '../workspace/graphWorkspace'
import './Algorithms.css'
import './Comparison.css'

const ALGO_OPTIONS: ComparisonAlgoId[] = ['bfs', 'dfs', 'dijkstra', 'bellman', 'prim', 'kruskal']

function workspaceToSaved(doc: WorkspaceGraph): SavedGraph {
  return {
    directed: doc.directed,
    nodes: doc.nodes.map(n => ({ id: n.id, position: n.position })),
    edges: doc.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight })),
  }
}

function toSaved(doc: { directed: boolean; nodes: Array<{ id: string; position: { x: number; y: number } }>; edges: Array<{ source: string; target: string; label?: unknown }> }): SavedGraph {
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

function defaultDocument(): { document: SavedGraph; start: string; end: string; notice: string; demoId: DemoGraphId | 'custom' } {
  const sample = sampleGraph()
  return {
    demoId: 'weighted',
    start: 'A',
    end: 'F',
    notice: 'Wczytano graf ważony. Wybierz dwa algorytmy i uruchom porównanie na identycznym wejściu.',
    document: {
      directed: sample.directed,
      nodes: sample.nodes.map(n => ({ id: n.id, position: n.position })),
      edges: sample.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })),
    },
  }
}

function bootFromEditor(): { document: SavedGraph; start: string; end: string; notice: string; demoId: DemoGraphId | 'custom' } | null {
  const workspace = loadWorkspace()
  if (!workspace || workspace.nodes.length === 0) return null
  clearOpenInComparisonFlag()
  return {
    demoId: 'custom',
    document: workspaceToSaved(workspace),
    start: workspace.start && workspace.nodes.some(n => n.id === workspace.start)
      ? workspace.start
      : workspace.nodes[0].id,
    end: workspace.end && workspace.nodes.some(n => n.id === workspace.end)
      ? workspace.end
      : workspace.nodes.at(-1)!.id,
    notice: `Wczytano graf z edytora (${workspace.nodes.length} wierzchołków, ${workspace.edges.length} krawędzi). Oba panele używają tych samych pozycji i wag.`,
  }
}

function snapshotWorkspaceRaw(): string | null {
  try {
    return localStorage.getItem('graphlab-editor-v1')
  } catch {
    return null
  }
}

export default function Comparison() {
  const location = useLocation()
  const openedFromEditor = Boolean((location.state as { fromEditor?: boolean } | null)?.fromEditor)
    || Boolean(loadWorkspaceMeta()?.openInComparison)
  const boot = openedFromEditor ? bootFromEditor() : null
  const initial = boot ?? defaultDocument()

  const [document, setDocument] = useState<SavedGraph>(initial.document)
  const [leftAlgo, setLeftAlgo] = useState<ComparisonAlgoId>('bfs')
  const [rightAlgo, setRightAlgo] = useState<ComparisonAlgoId>('dfs')
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [demoId, setDemoId] = useState<DemoGraphId | 'custom'>(initial.demoId)
  const [comparison, setComparison] = useState<ComparisonRun | null>(null)
  const [notice, setNotice] = useState(initial.notice)
  const [controlMode, setControlMode] = useState<'shared' | 'independent'>('shared')

  const leftPlayer = useStepPlayer()
  const rightPlayer = useStepPlayer()
  const sharedPlayer = useStepPlayer()

  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const pairWarnings = useMemo(() => buildPairWarnings(leftAlgo, rightAlgo), [leftAlgo, rightAlgo])

  const leftSide = comparison?.left ?? null
  const rightSide = comparison?.right ?? null
  const leftCount = sideStepCount(leftSide)
  const rightCount = sideStepCount(rightSide)

  const leftIndex = controlMode === 'shared'
    ? Math.min(sharedPlayer.index, Math.max(leftCount - 1, 0))
    : leftPlayer.index
  const rightIndex = controlMode === 'shared'
    ? Math.min(sharedPlayer.index, Math.max(rightCount - 1, 0))
    : rightPlayer.index

  const leftIsLast = controlMode === 'shared'
    ? leftCount === 0 || leftIndex >= leftCount - 1
    : leftPlayer.isLast
  const rightIsLast = controlMode === 'shared'
    ? rightCount === 0 || rightIndex >= rightCount - 1
    : rightPlayer.isLast

  const leftFlow = useMemo(
    () => buildSideFlow(document, leftSide, leftIndex, end, leftIsLast),
    [document, leftSide, leftIndex, end, leftIsLast],
  )
  const rightFlow = useMemo(
    () => buildSideFlow(document, rightSide, rightIndex, end, rightIsLast),
    [document, rightSide, rightIndex, end, rightIsLast],
  )

  const leftCaption = sideStepMessage(leftSide, leftIndex)
  const rightCaption = sideStepMessage(rightSide, rightIndex)

  useEffect(() => {
    if (!comparison) {
      leftPlayer.bind(0)
      rightPlayer.bind(0)
      sharedPlayer.bind(0)
      return
    }
    leftPlayer.bind(sideStepCount(comparison.left))
    rightPlayer.bind(sideStepCount(comparison.right))
    sharedPlayer.bind(Math.max(sideStepCount(comparison.left), sideStepCount(comparison.right)))
  }, [comparison]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSaved = () => {
    try {
      const before = snapshotWorkspaceRaw()
      const workspace = loadWorkspace()
      if (!workspace || workspace.nodes.length === 0) {
        setNotice('Najpierw zapisz lub wyślij graf z zakładki Edytor grafów.')
        return
      }
      fromEditor(workspace)
      setDocument(workspaceToSaved(workspace))
      setStart(workspace.start && workspace.nodes.some(n => n.id === workspace.start) ? workspace.start : workspace.nodes[0].id)
      setEnd(workspace.end && workspace.nodes.some(n => n.id === workspace.end) ? workspace.end : workspace.nodes.at(-1)!.id)
      setDemoId('custom')
      setComparison(null)
      setNotice('Wczytano graf z edytora. Dane workspace nie zostały nadpisane.')
      if (snapshotWorkspaceRaw() !== before) {
        throw new Error('Porównanie nie powinno zmieniać danych edytora.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nie udało się wczytać grafu')
    }
  }

  const loadDemo = (id: DemoGraphId) => {
    const before = snapshotWorkspaceRaw()
    const demo = DEMO_GRAPHS.find(item => item.id === id)
    if (!demo) return
    const built = demo.build()
    const saved = toSaved(built)
    setDocument(saved)
    setStart(demo.start)
    setEnd(demo.end)
    setDemoId(id)
    setComparison(null)
    setNotice(`Wczytano przykład lokalnie: ${demo.label}. Zapis w edytorze nie został zmieniony.`)
    if (snapshotWorkspaceRaw() !== before) {
      setNotice('Błąd: wczytanie przykładu nie może zmieniać edytora.')
    }
  }

  const execute = () => {
    const before = snapshotWorkspaceRaw()
    try {
      const result = runComparison(graph, leftAlgo, rightAlgo, start, end)
      setComparison(result)
      setNotice(
        `Porównanie gotowe. Lewa strona: ${COMPARISON_ALGO_NAMES[leftAlgo]} (${result.left.metrics.durationMs.toFixed(3)} ms), ` +
          `prawa: ${COMPARISON_ALGO_NAMES[rightAlgo]} (${result.right.metrics.durationMs.toFixed(3)} ms) — bez czasu animacji.`,
      )
      if (snapshotWorkspaceRaw() !== before) {
        throw new Error('Porównanie zmodyfikowało dane edytora — operacja przerwana.')
      }
    } catch (error) {
      setComparison(null)
      setNotice(error instanceof Error ? error.message : 'Nie udało się uruchomić porównania.')
    }
  }

  const showTimingCaveat = Boolean(
    comparison
    && comparison.left.metrics.durationMs < 1
    && comparison.right.metrics.durationMs < 1,
  )

  const observationTexts = comparison?.observations ?? [
    'Wybierz parę algorytmów i kliknij „Porównaj algorytmy”, aby zobaczyć edukacyjne podsumowanie różnic.',
    'Najbardziej wartościowe pary: BFS vs DFS (kolejność przeszukiwania), Dijkstra vs Bellman–Ford (najkrótsze ścieżki), Prim vs Kruskal (MST).',
  ]

  return (
    <div className="page-container cmp-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><GitCompare size={14} /> ALGORITHM COMPARISON</div>
          <h1>Porównanie algorytmów</h1>
          <p>
            Uruchom dwa algorytmy na dokładnie tym samym grafie: te same wierzchołki, wagi i pozycje.
            Obserwuj różnice w przebiegu, metrykach i wyniku — bez mieszania czasu animacji z czasem obliczeń.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/editor" className="btn btn-outline">
            <ArrowLeft size={15} /> Wróć do edytora
          </Link>
          <span className="version-pill">Moduł porównawczy</span>
        </div>
      </div>

      <section className="panel cmp-config">
        <div className="panel-header">
          <h3>Konfiguracja porównania</h3>
          <span className="section-chip"><Columns2 size={13} /> wspólne wejście</span>
        </div>
        <div className="cmp-config-grid">
          <label>
            Algorytm lewy
            <select value={leftAlgo} onChange={e => { setLeftAlgo(e.target.value as ComparisonAlgoId); setComparison(null) }}>
              {ALGO_OPTIONS.map(id => <option key={id} value={id}>{COMPARISON_ALGO_NAMES[id]}</option>)}
            </select>
          </label>
          <label>
            Algorytm prawy
            <select value={rightAlgo} onChange={e => { setRightAlgo(e.target.value as ComparisonAlgoId); setComparison(null) }}>
              {ALGO_OPTIONS.map(id => <option key={id} value={id}>{COMPARISON_ALGO_NAMES[id]}</option>)}
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
            Start
            <select value={start} onChange={e => { setStart(e.target.value); setComparison(null) }}>
              {graph.vertices.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Cel ścieżki
            <select
              value={end}
              onChange={e => { setEnd(e.target.value); setComparison(null) }}
              disabled={isMstAlgorithm(leftAlgo) && isMstAlgorithm(rightAlgo)}
            >
              {graph.vertices.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Sterowanie animacją
            <select value={controlMode} onChange={e => setControlMode(e.target.value as 'shared' | 'independent')}>
              <option value="shared">Wspólne</option>
              <option value="independent">Niezależne</option>
            </select>
          </label>
        </div>
        <div className="cmp-config-actions">
          <button className="algo-btn algo-primary" onClick={execute}>
            <Play size={16} /> Porównaj algorytmy
          </button>
          <button className="algo-btn" onClick={loadSaved}>
            <Upload size={16} /> Wczytaj z edytora
          </button>
          <Link className="algo-btn" to="/editor">
            <ArrowLeft size={16} /> Edytuj graf
          </Link>
          <div className="cmp-graph-meta">
            <span>{graph.vertices.length} wierzchołków</span>
            <span>{graph.links.length} krawędzi</span>
            <span>{graph.directed ? 'Skierowany' : 'Nieskierowany'}</span>
            <span>{demoId === 'custom' ? 'Źródło: edytor' : 'Źródło: przykład lokalny'}</span>
          </div>
        </div>
        {pairWarnings.length > 0 && (
          <div className="cmp-warnings">
            {pairWarnings.map(warning => (
              <div key={warning.title} className={`cmp-warning cmp-warning-${warning.level}`}>
                <strong>{warning.title}</strong>
                <p>{warning.message}</p>
              </div>
            ))}
          </div>
        )}
        <p className="cmp-notice">{notice}</p>
      </section>

      <div className="cmp-boards">
        {[
          { side: 'left' as const, algo: leftAlgo, flow: leftFlow, caption: leftCaption, player: leftPlayer, index: leftIndex, count: leftCount },
          { side: 'right' as const, algo: rightAlgo, flow: rightFlow, caption: rightCaption, player: rightPlayer, index: rightIndex, count: rightCount },
        ].map(board => (
          <section key={board.side} className="panel cmp-board">
            <div className="panel-header">
              <h3>{board.side === 'left' ? 'Lewy przebieg' : 'Prawy przebieg'}</h3>
              <span className="section-chip">{COMPARISON_ALGO_NAMES[board.algo]}</span>
            </div>
            <div className="cmp-canvas">
              <ReactFlow
                nodes={board.flow.nodes}
                edges={board.flow.edges}
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
            {controlMode === 'independent' && (
              <AlgorithmPlayer player={board.player} disabled={!comparison} />
            )}
            <div className="cmp-step-card">
              <strong>{board.caption.title}</strong>
              <span>{board.caption.message}</span>
              <small>Krok {comparison ? board.index + 1 : 0} / {board.count}</small>
            </div>
          </section>
        ))}
      </div>

      {controlMode === 'shared' && (
        <section className="panel cmp-shared-player">
          <div className="panel-header">
            <h3>Wspólne sterowanie odtwarzaniem</h3>
            <span className="section-chip">różne długości przebiegów są obsługiwane</span>
          </div>
          <AlgorithmPlayer player={sharedPlayer} disabled={!comparison} />
          <p className="cmp-note">
            Wspólny suwak odtwarza do dłuższej animacji. Krótszy przebieg zatrzymuje się na ostatnim kroku,
            podczas gdy drugi kontynuuje — dzięki temu widać różnicę liczby operacji.
          </p>
        </section>
      )}

      <section className="panel cmp-legend-panel">
        <div className="panel-header"><h3>Legenda kolorów</h3></div>
        <div className="cmp-legend">
          <span><i className="algo-dot algo-dot-active" /> bieżący wierzchołek</span>
          <span><i className="algo-dot algo-dot-frontier" /> w strukturze / kolejce</span>
          <span><i className="algo-dot algo-dot-visited" /> odwiedzony</span>
          <span><i className="algo-dot algo-dot-path" /> wynikowa ścieżka / MST</span>
          <span><i className="cmp-dot cmp-dot-edge" /> analizowana krawędź</span>
          <span><i className="cmp-dot cmp-dot-mst" /> rozważana krawędź MST</span>
        </div>
      </section>

      <section className="panel cmp-stats">
        <div className="panel-header">
          <h3>Tabela porównawcza</h3>
        </div>
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Metryka</th>
                <th>{COMPARISON_ALGO_NAMES[leftAlgo]}</th>
                <th>{COMPARISON_ALGO_NAMES[rightAlgo]}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Liczba wierzchołków</td>
                <td>{comparison?.left.metrics.vertices ?? graph.vertices.length}</td>
                <td>{comparison?.right.metrics.vertices ?? graph.vertices.length}</td>
              </tr>
              <tr>
                <td>Liczba krawędzi</td>
                <td>{comparison?.left.metrics.edges ?? graph.links.length}</td>
                <td>{comparison?.right.metrics.edges ?? graph.links.length}</td>
              </tr>
              <tr>
                <td>Odwiedzone wierzchołki</td>
                <td>{comparison?.left.metrics.visitedVertices ?? '—'}</td>
                <td>{comparison?.right.metrics.visitedVertices ?? '—'}</td>
              </tr>
              <tr>
                <td>Analizowane krawędzie</td>
                <td>{comparison?.left.metrics.examinedEdges ?? '—'}</td>
                <td>{comparison?.right.metrics.examinedEdges ?? '—'}</td>
              </tr>
              <tr>
                <td>Kroki animacji</td>
                <td>{comparison?.left.metrics.animationSteps ?? '—'}</td>
                <td>{comparison?.right.metrics.animationSteps ?? '—'}</td>
              </tr>
              <tr>
                <td>Operacje algorytmu</td>
                <td>{comparison?.left.metrics.operations ?? '—'}</td>
                <td>{comparison?.right.metrics.operations ?? '—'}</td>
              </tr>
              <tr>
                <td>Czas obliczeń (ms)</td>
                <td>{comparison ? comparison.left.metrics.durationMs.toFixed(3) : '—'}</td>
                <td>{comparison ? comparison.right.metrics.durationMs.toFixed(3) : '—'}</td>
              </tr>
              <tr>
                <td>Wynik</td>
                <td>
                  {comparison
                    ? <><div className="cmp-result-kind">{comparison.left.metrics.resultKind}</div>{comparison.left.metrics.resultText}</>
                    : '—'}
                </td>
                <td>
                  {comparison
                    ? <><div className="cmp-result-kind">{comparison.right.metrics.resultKind}</div>{comparison.right.metrics.resultText}</>
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="cmp-metric-help">
          {METRIC_EXPLANATIONS.map(item => (
            <p key={item.key}><b>{item.label}:</b> {item.explanation}</p>
          ))}
        </div>
        {showTimingCaveat && (
          <div className="cmp-timing-caveat">
            <Info size={16} />
            <p>
              Oba pomiary są bardzo krótkie (&lt; 1 ms). Nie ogłaszamy zwycięzcy czasowego na podstawie
              pojedynczego uruchomienia — występuje naturalna zmienność pomiaru w przeglądarce.
            </p>
          </div>
        )}
      </section>

      <section className="panel cmp-observe">
        <div className="panel-header"><h3>Co możemy zaobserwować?</h3></div>
        <div className="cmp-observe-body">
          {observationTexts.map(text => <p key={text}>{text}</p>)}
        </div>
        <Link to="/editor" className="algo-editor-link">
          Wróć do edytora bez utraty danych <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  )
}
