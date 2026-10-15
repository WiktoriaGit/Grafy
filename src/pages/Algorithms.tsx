import { useEffect, useMemo, useState } from 'react'
import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { ArrowRight, Pause, Play, RotateCcw, SkipForward, Upload, GitBranch } from 'lucide-react'
import { fromEditor, runAlgorithm, type Algorithm, type Graph, type Run } from '../algorithms/graphAlgorithms'
import { sampleGraph } from '../utils/graphData'
import './Algorithms.css'

const KEY = 'graphlab-editor-v1'
const names: Record<Algorithm, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', bellman: 'Bellman–Ford' }
const sample = sampleGraph()
const initial: Saved = { directed: sample.directed, nodes: sample.nodes.map(n => ({ id: n.id, position: n.position })), edges: sample.edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })) }

type Saved = { nodes: Array<{ id: string; position?: { x: number; y: number } }>; edges: Array<{ source: string; target: string; weight?: number; label?: string }>; directed: boolean }

export default function Algorithms() {
  const [document, setDocument] = useState<Saved>(initial)
  const [algorithm, setAlgorithm] = useState<Algorithm>('dijkstra')
  const [start, setStart] = useState('A')
  const [end, setEnd] = useState('F')
  const [run, setRun] = useState<Run | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(650)
  const [notice, setNotice] = useState('Wczytano graf demonstracyjny. Możesz wczytać graf zapisany w edytorze.')
  const graph: Graph = useMemo(() => fromEditor(document), [document])
  const step = run?.steps[index]

  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) { setNotice('Najpierw zapisz graf w zakładce Edytor grafów.'); return }
      const parsed: unknown = JSON.parse(raw)
      const checked = fromEditor(parsed)
      const doc = parsed as Saved
      setDocument(doc); setStart(checked.vertices[0] ?? ''); setEnd(checked.vertices.at(-1) ?? '')
      setRun(null); setIndex(0); setPlaying(false)
      setNotice('Wczytano graf zapisany w edytorze.')
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Nie udało się wczytać grafu') }
  }
  const execute = () => {
    try {
      const result = runAlgorithm(graph, algorithm, start, end)
      setRun(result); setIndex(0); setPlaying(false)
      setNotice(result.error ?? `Obliczenia zakończone: ${result.steps.length} kroków animacji.`)
    } catch (e) { setRun(null); setPlaying(false); setNotice(e instanceof Error ? e.message : 'Błąd algorytmu') }
  }
  useEffect(() => {
    if (!playing || !run) return
    if (index >= run.steps.length - 1) return
    const timer = window.setTimeout(() => setIndex(i => Math.min(i + 1, run.steps.length - 1)), speed)
    return () => window.clearTimeout(timer)
  }, [playing, index, run, speed])
  const last = !!run && index === run.steps.length - 1
  const nodes: Node[] = document.nodes.map((n, i) => {
    const active = step?.current === n.id
    const visited = step?.visited.includes(n.id)
    const onPath = last && run?.path.includes(n.id)
    return {
      id: n.id, position: n.position ?? { x: 150 + i * 110, y: 150 }, data: { label: n.id },
      style: { width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#fff', background: onPath ? '#059669' : active ? '#7c3aed' : visited ? '#3730a3' : '#24324c', border: `2px solid ${onPath ? '#6ee7b7' : active ? '#ddd6fe' : visited ? '#a5b4fc' : '#52647f'}`, boxShadow: active ? '0 0 22px #8b5cf699' : 'none' },
    }
  })
  const edges: Edge[] = document.edges.map((e, i) => {
    const highlighted = step?.activeEdge === `${e.source}|${e.target}` || (!document.directed && step?.activeEdge === `${e.target}|${e.source}`)
    const onPath = last && run?.path.some((v, j, p) => j > 0 && (p[j - 1] === e.source && v === e.target || !document.directed && p[j - 1] === e.target && v === e.source))
    const color = onPath ? '#34d399' : highlighted ? '#c4b5fd' : '#64748b'
    return { id: `algo-${i}`, source: e.source, target: e.target, label: String(e.weight ?? e.label ?? 1), type: 'straight', animated: !!highlighted, style: { stroke: color, strokeWidth: highlighted || onPath ? 3.5 : 1.8 }, markerEnd: document.directed ? { type: MarkerType.ArrowClosed, color } : undefined, labelStyle: { fill: '#e2e8f0', fontWeight: 700 }, labelBgStyle: { fill: '#17243a' } }
  })
  const changeAlgorithm = (value: Algorithm) => { setAlgorithm(value); setRun(null); setIndex(0); setPlaying(false) }
  return <div className="page-container">
    <div className="page-heading"><div><div className="eyebrow"><GitBranch size={14}/> ALGORITHM EXPLORER</div><h1>Wizualizacja algorytmów</h1><p>Własne implementacje i animacja kolejnych operacji na grafie.</p></div><span className="version-pill">4 algorytmy</span></div>
    <div className="algo-layout">
      <section className="panel algo-controls"><div className="panel-header"><h3>Konfiguracja</h3></div><div className="algo-form">
        <label>Algorytm<select value={algorithm} onChange={e => changeAlgorithm(e.target.value as Algorithm)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Wierzchołek początkowy<select value={start} onChange={e => { setStart(e.target.value); setRun(null); setPlaying(false) }}>{graph.vertices.map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Wierzchołek końcowy<select value={end} onChange={e => { setEnd(e.target.value); setRun(null); setPlaying(false) }}>{graph.vertices.map(v => <option key={v}>{v}</option>)}</select></label>
        <button className="algo-btn algo-primary" onClick={execute}><Play size={16}/> Uruchom algorytm</button>
        <button className="algo-btn" onClick={loadSaved}><Upload size={16}/> Wczytaj z edytora</button>
        <div className="algo-summary"><strong>Graf</strong><span>{graph.vertices.length} wierzchołków</span><span>{graph.links.length} krawędzi</span><span>{graph.directed ? 'Skierowany' : 'Nieskierowany'}</span></div>
        <p className="algo-note">BFS i DFS nie uwzględniają wag. Dijkstra wymaga wag nieujemnych. Bellman–Ford obsługuje wagi ujemne i wykrywa cykle ujemne wpływające na cel.</p>
      </div></section>
      <section className="panel algo-main"><div className="panel-header"><h3>Przebieg algorytmu</h3><span className="section-chip">{names[algorithm]}</span></div>
        <div className="algo-canvas"><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .4 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155"/><Controls showInteractive={false}/></ReactFlow></div>
        <div className="algo-playback"><button onClick={() => { setIndex(0); setPlaying(false) }} disabled={!run} title="Reset"><RotateCcw size={18}/></button><button onClick={() => { if (last) setIndex(0); setPlaying(p => !p) }} disabled={!run} title={playing ? 'Pauza' : 'Odtwórz'}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button><button onClick={() => { setPlaying(false); setIndex(i => Math.min(i + 1, (run?.steps.length ?? 1) - 1)) }} disabled={!run || last} title="Następny krok"><SkipForward size={18}/></button><span>Krok {run ? index + 1 : 0}/{run?.steps.length ?? 0}</span><label>Tempo <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1200}>Wolno</option><option value={650}>Normalnie</option><option value={250}>Szybko</option></select></label></div>
        <div className="algo-message">{step?.message ?? notice}</div>
      </section>
    </div>
    <div className="algo-metrics">
      <div className="panel"><small>Odwiedzone wierzchołki</small><strong>{step?.visited.length ?? 0}</strong></div>
      <div className="panel"><small>Operacje (cały przebieg)</small><strong>{run?.operations ?? '—'}</strong></div>
      <div className="panel"><small>Obliczony dystans</small><strong>{run?.distance ?? '—'}</strong></div>
      <div className="panel"><small>Czas obliczeń</small><strong>{run ? `${run.durationMs.toFixed(3)} ms` : '—'}</strong></div>
    </div>
    <div className="panel algo-detail"><h3>Wynik i kolejność odwiedzin</h3><p><b>Trasa:</b> {run?.path.length ? run.path.join(' → ') : 'Brak wyznaczonej trasy'}</p><p><b>Kolejność:</b> {run?.order.join(' → ') || '—'}</p><p className="algo-note">Czas dotyczy samego obliczenia, bez renderowania animacji. BFS/DFS pokazują liczbę krawędzi ścieżki, nie sumę wag. Pomiar pojedynczego małego grafu nie służy do porównywania wydajności.</p><a href="/editor" className="algo-editor-link">Przejdź do edytora grafów <ArrowRight size={15}/></a></div>
  </div>
}
