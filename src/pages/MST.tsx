import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Background, BackgroundVariant, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { ArrowLeft, GitBranch, Play, Upload } from 'lucide-react'
import { fromEditor, type Graph } from '../algorithms/graphAlgorithms'
import { calculateMST, type MSTAlgorithm, type MSTEdge, type MSTResult } from '../algorithms/mstAlgorithms'
import { DEMO_GRAPHS } from '../utils/demoGraphs'
import { ALGORITHM_GUIDES } from '../utils/demoScenarios'
import AlgorithmPlayer from '../visualization/AlgorithmPlayer'
import GraphCalloutsOverlay from '../visualization/GraphCalloutsOverlay'
import { calloutsFromMstStep } from '../visualization/graphCallouts'
import MstInsightPanel from '../visualization/MstInsightPanel'
import { useStepPlayer } from '../visualization/useStepPlayer'
import { loadWorkspace } from '../workspace/graphWorkspace'
import './Algorithms.css'
import './MST.css'

type Document = {
  nodes: Array<{ id: string; position?: { x: number; y: number } }>
  edges: Array<{ source: string; target: string; weight?: number; label?: string | number }>
  directed: boolean
}

const mstDemo = DEMO_GRAPHS.find(item => item.id === 'mst')!
const mstBuilt = mstDemo.build()
const example: Document = {
  directed: false,
  nodes: mstBuilt.nodes.map(n => ({ id: n.id, position: n.position })),
  edges: mstBuilt.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })),
}

export default function MST() {
  const [document, setDocument] = useState<Document>(example)
  const [algorithm, setAlgorithm] = useState<MSTAlgorithm>('prim')
  const [start, setStart] = useState(mstDemo.start)
  const [result, setResult] = useState<MSTResult | null>(null)
  const [notice, setNotice] = useState(
    'Wczytano nieskierowany graf MST. Uruchom Prima lub Kruskala — albo otwórz Porównanie, by zobaczyć oba jednocześnie.',
  )
  const [showGraphCallouts, setShowGraphCallouts] = useState(true)
  const player = useStepPlayer()
  const { bind, seek } = player
  const guide = ALGORITHM_GUIDES[algorithm]

  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const indexedEdges: MSTEdge[] = useMemo(
    () => graph.links.map((e, id) => ({ ...e, id })),
    [graph],
  )
  const step = result?.steps[player.index]
  const graphCallouts = useMemo(
    () => calloutsFromMstStep(step, player.index),
    [step, player.index],
  )
  const finished = !!result && player.isLast

  useEffect(() => {
    bind(result?.steps.length ?? 0)
  }, [result, bind])

  const load = () => {
    try {
      const workspace = loadWorkspace()
      if (!workspace || workspace.nodes.length === 0) {
        setNotice('Najpierw zapisz graf w edytorze.')
        return
      }
      const checked = fromEditor(workspace)
      if (checked.directed) {
        throw new Error('Graf jest skierowany. Prim i Kruskal wymagają grafu nieskierowanego — zmień typ w edytorze i zapisz.')
      }
      setDocument({
        directed: false,
        nodes: workspace.nodes.map(n => ({ id: n.id, position: n.position })),
        edges: workspace.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight })),
      })
      setStart(workspace.start && checked.vertices.includes(workspace.start) ? workspace.start : checked.vertices[0] ?? '')
      setResult(null)
      setNotice(`Wczytano graf z edytora (${checked.vertices.length} wierzchołków, ${checked.links.length} krawędzi). Rozmieszczenie zachowane.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Błąd wczytywania grafu.')
    }
  }

  const run = () => {
    try {
      const calculated = calculateMST(graph, algorithm, start)
      setResult(calculated)
      setNotice(
        `Obliczenia z przygotowaniem ${calculated.steps.length} kroków: ${calculated.durationMs.toFixed(3)} ms (bez pauz odtwarzania), ` +
          `waga ${calculated.totalWeight}, ${calculated.connected ? 'MST spójne' : 'las rozpinający'}.`,
      )
    } catch (error) {
      setResult(null)
      setNotice(error instanceof Error ? error.message : 'Błąd obliczeń.')
    }
  }

  const nodes: Node[] = document.nodes.map((n, i) => {
    const inTree = step?.visited.includes(n.id) ?? false
    return {
      id: n.id,
      position: n.position ?? { x: 100 + (i % 5) * 135, y: 100 + Math.floor(i / 5) * 135 },
      data: { label: n.id },
      style: {
        width: 56,
        height: 56,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        color: '#fff',
        background: inTree ? '#145c4b' : '#24324c',
        border: `2px solid ${inTree ? '#34d399' : '#52647f'}`,
        boxShadow: inTree ? '0 0 14px #34d39955' : 'none',
      },
    }
  })

  const edges: Edge[] = document.edges.map((e, i) => {
    const chosen = step?.selected.includes(i) ?? false
    const considered = step?.considered === i
    const candidate = step?.candidates?.includes(i) ?? false
    const color = chosen ? '#34d399' : considered ? '#fbbf24' : candidate ? '#38bdf8' : '#64748b'
    return {
      id: `mst-${i}`,
      source: e.source,
      target: e.target,
      label: String(e.weight ?? e.label ?? 1),
      type: 'straight',
      animated: considered,
      style: { stroke: color, strokeWidth: chosen || considered || candidate ? 3.4 : 1.8 },
      labelStyle: { fill: '#e2e8f0', fontWeight: 700 },
      labelBgStyle: { fill: '#17243a' },
    }
  })

  return (
    <div className="page-container algo-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><GitBranch size={14} /> GRAPH THEORY</div>
          <h1>Minimalne drzewo rozpinające</h1>
          <p>
            Prim i Kruskal z pełną, krokową prezentacją: kandydaci, Union–Find, historia operacji i pseudokod.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/editor" className="btn btn-outline">
            <ArrowLeft size={15} /> Wróć do edytora
          </Link>
          <span className="version-pill">MST edukacyjne</span>
        </div>
      </div>

      <div className="algo-workspace mst-edu-workspace">
        <section className="panel algo-controls">
          <div className="panel-header"><h3>Konfiguracja</h3></div>
          <div className="algo-form">
            <label>
              Algorytm
              <select
                value={algorithm}
                onChange={e => {
                  setAlgorithm(e.target.value as MSTAlgorithm)
                  setResult(null)
                }}
              >
                <option value="prim">Prim</option>
                <option value="kruskal">Kruskal</option>
              </select>
            </label>
            <div className="algo-hints">
              <strong>Zastosowanie</strong>
              <p>{guide.use}</p>
              <strong>Ograniczenia</strong>
              <p>{guide.limits}</p>
            </div>
            {algorithm === 'prim' && (
              <label>
                Wierzchołek początkowy
                <select
                  value={start}
                  onChange={e => {
                    setStart(e.target.value)
                    setResult(null)
                  }}
                >
                  {graph.vertices.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            )}
            <button className="algo-btn algo-primary" onClick={run}>
              <Play size={16} /> Uruchom algorytm
            </button>
            <button className="algo-btn" onClick={load}>
              <Upload size={16} /> Wczytaj z edytora
            </button>
            <Link className="algo-btn" to="/comparison">Porównaj Prim vs Kruskal</Link>
            <div className="algo-summary">
              <strong>Graf</strong>
              <span>{graph.vertices.length} wierzchołków</span>
              <span>{graph.links.length} krawędzi</span>
              <span>{graph.directed ? 'Skierowany — niedozwolony' : 'Nieskierowany'}</span>
            </div>
            <div className="algo-legend">
              <span><i className="algo-dot algo-dot-path" /> w drzewie/lesie</span>
              <span><i className="cmp-dot cmp-dot-mst" /> rozważana</span>
              <span><i className="algo-dot algo-dot-frontier" /> kandydat (Prim)</span>
              <span><i className="algo-dot algo-dot-visited" /> wybrana krawędź</span>
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
              MST to minimalne drzewo (las) rozpinające — inny problem niż najkrótsza ścieżka od źródła.
              Porównanie Prim vs Kruskal dotyczy kolejności wyboru krawędzi i łącznej wagi drzewa na małych grafach edukacyjnych,
              nie benchmarku z Eksperymentów. Dla niespójnego grafu budujemy minimalny las rozpinający
              (Prim otwiera kolejne drzewa; Kruskal łączy komponenty Union–Find).
            </p>
          </div>
        </section>

        <section className="panel algo-main">
          <div className="panel-header">
            <h3>Przebieg na grafie</h3>
            <span className="section-chip">{algorithm === 'prim' ? 'Prim' : 'Kruskal'}</span>
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
              <GraphCalloutsOverlay callouts={graphCallouts} enabled={showGraphCallouts} />
            </ReactFlow>
          </div>
          <AlgorithmPlayer player={player} disabled={!result} />
          <div className="algo-message">
            <strong>{step?.title ?? 'Gotowe'}</strong>
            <span>{step?.message ?? notice}</span>
            {step?.reason && <small className="algo-why"><b>Dlaczego?</b> {step.reason}</small>}
            {step && <small>Łączna waga bieżąca: {step.treeWeight}</small>}
          </div>
        </section>

        <MstInsightPanel
          algorithm={algorithm}
          step={step}
          steps={result?.steps ?? []}
          stepIndex={player.index}
          edges={indexedEdges}
          vertices={graph.vertices}
          notice={notice}
          onSelectStep={seek}
        />
      </div>

      <div className="algo-metrics">
        <div className="panel">
          <small>Krok</small>
          <strong>{result ? `${player.index + 1} z ${result.steps.length}` : '—'}</strong>
        </div>
        <div className="panel">
          <small>Wybrane krawędzie</small>
          <strong>{step?.selected.length ?? result?.selected.length ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Łączna waga</small>
          <strong>{step?.treeWeight ?? result?.totalWeight ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Operacje</small>
          <strong>{result?.operations ?? '—'}</strong>
        </div>
        <div className="panel">
          <small>Czas z przygotowaniem kroków</small>
          <strong>{result ? `${result.durationMs.toFixed(3)} ms` : '—'}</strong>
        </div>
        <div className="panel">
          <small>Wynik</small>
          <strong>{result ? (result.connected ? 'MST' : 'Las') : '—'}</strong>
        </div>
      </div>

      {result && (
        <section className="panel algo-detail">
          <h3>Podsumowanie</h3>
          <p>
            <b>Status:</b>{' '}
            {result.connected
              ? 'Otrzymano minimalne drzewo rozpinające.'
              : 'Graf niespójny: wynik jest minimalnym lasem rozpinającym.'}
          </p>
          <p>
            <b>Krawędzie wyniku:</b>{' '}
            {result.selected.map(e => `${e.source}–${e.target}(${e.weight})`).join(', ') || 'brak'}
          </p>
          <p className="algo-note">
            Czas obejmuje algorytm edukacyjny wraz z budową kroków wizualizacji (`performance.now`), bez pauz odtwarzania.
            Nie porównuj go bezpośrednio z czasami z Eksperymentów. Suwak odtwarza wcześniej zapisane stany
            {finished ? ' — wyświetlany jest stan końcowy.' : '.'}
          </p>
        </section>
      )}
    </div>
  )
}
