import { useEffect, useMemo, useState } from 'react'
import { Background, BackgroundVariant, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { GitBranch, Pause, Play, RotateCcw, SkipForward, Upload } from 'lucide-react'
import { fromEditor, type Graph } from '../algorithms/graphAlgorithms'
import { calculateMST, type MSTAlgorithm, type MSTResult } from '../algorithms/mstAlgorithms'
import { sampleGraph } from '../utils/graphData'
import './MST.css'

type Document = { nodes: Array<{ id: string; position?: { x: number; y: number } }>; edges: Array<{ source: string; target: string; weight?: number; label?: string | number }>; directed: boolean }
const KEY = 'graphlab-editor-v1'
const sample = sampleGraph()
const example: Document = { directed: false, nodes: sample.nodes.map(n => ({ id: n.id, position: n.position })), edges: sample.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })) }

export default function MST() {
  const [document, setDocument] = useState<Document>(example)
  const [algorithm, setAlgorithm] = useState<MSTAlgorithm>('prim')
  const [start, setStart] = useState('A')
  const [result, setResult] = useState<MSTResult | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(650)
  const [notice, setNotice] = useState('Przykładowy graf nieskierowany jest gotowy do obliczeń.')
  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const step = result?.steps[stepIndex]
  const finished = !!result && stepIndex === result.steps.length - 1

  const load = () => {
    try {
      const saved = localStorage.getItem(KEY)
      if (!saved) { setNotice('Najpierw zapisz graf w edytorze.'); return }
      const parsed: unknown = JSON.parse(saved)
      const checked = fromEditor(parsed)
      if (checked.directed) throw new Error('Graf jest skierowany. Zmień go na nieskierowany w edytorze i zapisz.')
      setDocument(parsed as Document)
      setStart(checked.vertices[0] ?? '')
      setResult(null); setStepIndex(0); setPlaying(false)
      setNotice('Wczytano graf z edytora.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Błąd wczytywania grafu.') }
  }
  const run = () => {
    try {
      const calculated = calculateMST(graph, algorithm, start)
      setResult(calculated); setStepIndex(0); setPlaying(false)
      setNotice(`Wykonano ${calculated.steps.length} kroków. Możesz odtworzyć animację.`)
    } catch (error) { setResult(null); setPlaying(false); setNotice(error instanceof Error ? error.message : 'Błąd obliczeń.') }
  }
  useEffect(() => {
    if (!playing || !result || finished) return
    const timer = window.setTimeout(() => setStepIndex(i => Math.min(i + 1, result.steps.length - 1)), speed)
    return () => window.clearTimeout(timer)
  }, [playing, result, finished, speed, stepIndex])

  const nodes: Node[] = document.nodes.map((n, i) => ({
    id: n.id, position: n.position ?? { x: 100 + (i % 5) * 135, y: 100 + Math.floor(i / 5) * 135 }, data: { label: n.id },
    style: { width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#fff', background: step?.visited.includes(n.id) ? '#145c4b' : '#24324c', border: `2px solid ${step?.visited.includes(n.id) ? '#34d399' : '#52647f'}` },
  }))
  const edges: Edge[] = document.edges.map((e, i) => {
    const chosen = step?.selected.includes(i)
    const considered = step?.considered === i
    const color = chosen ? '#34d399' : considered ? '#fbbf24' : '#64748b'
    return { id: `mst-${i}`, source: e.source, target: e.target, label: String(e.weight ?? e.label ?? 1), type: 'straight', animated: considered, style: { stroke: color, strokeWidth: chosen || considered ? 3.5 : 1.8 }, labelStyle: { fill: '#e2e8f0', fontWeight: 700 }, labelBgStyle: { fill: '#17243a' } }
  })
  return <div className="page-container">
    <div className="page-heading"><div><div className="eyebrow"><GitBranch size={14}/> GRAPH THEORY</div><h1>Minimalne drzewo rozpinające</h1><p>Algorytmy Prima i Kruskala — wizualizacja i analiza krok po kroku.</p></div><span className="version-pill">2 algorytmy</span></div>
    <div className="mst-layout">
      <section className="panel mst-controls"><div className="panel-header"><h3>Konfiguracja</h3></div><div className="mst-form">
        <label>Algorytm<select value={algorithm} onChange={e => { setAlgorithm(e.target.value as MSTAlgorithm); setResult(null); setPlaying(false) }}><option value="prim">Prim</option><option value="kruskal">Kruskal</option></select></label>
        {algorithm === 'prim' && <label>Wierzchołek początkowy<select value={start} onChange={e => { setStart(e.target.value); setResult(null); setPlaying(false) }}>{graph.vertices.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
        <button className="mst-btn mst-primary" onClick={run}><Play size={16}/> Uruchom algorytm</button>
        <button className="mst-btn" onClick={load}><Upload size={16}/> Wczytaj z edytora</button>
        <div className="mst-summary"><strong>Graf</strong><span>{graph.vertices.length} wierzchołków</span><span>{graph.links.length} krawędzi</span><span>{graph.directed ? 'Skierowany — niedozwolony' : 'Nieskierowany'}</span></div>
        <p className="mst-note">MST istnieje dla spójnego grafu nieskierowanego. Dla grafu niespójnego algorytm wyznacza las rozpinający.</p>
      </div></section>
      <section className="panel mst-main"><div className="panel-header"><h3>Przebieg algorytmu</h3><span className="section-chip">{algorithm === 'prim' ? 'Prim' : 'Kruskal'}</span></div>
        <div className="mst-canvas"><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .4 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155"/><Controls showInteractive={false}/></ReactFlow></div>
        <div className="mst-playback"><button onClick={() => { setStepIndex(0); setPlaying(false) }} disabled={!result} title="Reset"><RotateCcw size={18}/></button><button onClick={() => { if (finished) setStepIndex(0); setPlaying(p => !p) }} disabled={!result} title={playing ? 'Pauza' : 'Odtwórz'}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button><button onClick={() => { setPlaying(false); setStepIndex(i => Math.min(i + 1, (result?.steps.length ?? 1) - 1)) }} disabled={!result || finished} title="Następny krok"><SkipForward size={18}/></button><span>Krok {result ? stepIndex + 1 : 0}/{result?.steps.length ?? 0}</span><label>Tempo <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1200}>Wolno</option><option value={650}>Normalnie</option><option value={250}>Szybko</option></select></label></div>
        <div className="mst-message">{step?.message ?? notice}</div>
      </section>
    </div>
    {result && <section className="panel mst-results"><div className="panel-header"><h3>Wyniki obliczeń</h3></div><div className="mst-metrics"><div><span>Łączna waga</span><strong>{result.totalWeight}</strong></div><div><span>Wybrane krawędzie</span><strong>{result.selected.length}</strong></div><div><span>Operacje</span><strong>{result.operations}</strong></div><div><span>Czas obliczeń</span><strong>{result.durationMs.toFixed(3)} ms</strong></div></div><p>{result.connected ? 'Otrzymano minimalne drzewo rozpinające.' : 'Graf niespójny: wynik jest lasem rozpinającym.'}</p></section>}
  </div>
}
