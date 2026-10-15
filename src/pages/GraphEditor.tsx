import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addEdge, Background, BackgroundVariant, Controls, MarkerType, ReactFlow,
  useEdgesState, useNodesState, type Connection, type Edge, type Node,
  type OnSelectionChangeParams, type ReactFlowInstance,
} from '@xyflow/react'
import {
  Download, FileUp, GitBranch, MousePointer2, Network, Plus, RotateCcw,
  Save, Settings2, Shuffle, Trash2,
} from 'lucide-react'
import { generateRandomGraph, sampleGraph, type GraphDocument } from '../utils/graphData'
import { getSavedGraphs, getSavedGraph, saveGraph, deleteSavedGraph, type SavedGraphInfo } from '../services/graphApi'
import './GraphEditor.css'

const STORAGE_KEY = 'graphlab-editor-v1'
const nodeStyle = { width: 54, height: 54, borderRadius: '50%', background: '#283657', border: '2px solid #818cf8', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 700, boxShadow: '0 5px 22px #0003' }
const edgeStyle = { stroke: '#7c8ba7', strokeWidth: 2 }
const makeNode = (id: string, x: number, y: number): Node => ({ id, position: { x, y }, data: { label: id }, style: nodeStyle })
const makeEdge = (source: string, target: string, weight: number, directed: boolean): Edge => ({
  id: `${source}-${target}-${crypto.randomUUID()}`, source, target, label: String(weight),
  type: 'straight', style: edgeStyle,
  markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined,
  labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 12 },
  labelBgStyle: { fill: '#17243a', fillOpacity: 1 }, labelBgPadding: [6, 4], labelBgBorderRadius: 5,
})
function decorateEdge(edge: Edge, directed: boolean): Edge {
  return { ...edge, markerEnd: directed ? { type: MarkerType.ArrowClosed, color: '#7c8ba7' } : undefined }
}
function parseDocument(raw: unknown): GraphDocument {
  if (!raw || typeof raw !== 'object') throw new Error('Nieprawidłowy format pliku')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges) || typeof obj.directed !== 'boolean') throw new Error('Plik nie zawiera poprawnego grafu')
  if (obj.nodes.length > 300 || obj.edges.length > 3000) throw new Error('Graf jest zbyt duży dla edytora')
  const ids = new Set<string>()
  const nodes = obj.nodes.map((item: unknown) => {
    const n = item as Record<string, unknown>
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !n.position || typeof n.position !== 'object') throw new Error('Nieprawidłowy wierzchołek')
    const pos = n.position as Record<string, unknown>
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw new Error('Nieprawidłowe współrzędne')
    ids.add(n.id)
    return makeNode(n.id, pos.x, pos.y)
  })
  const edges = obj.edges.map((item: unknown) => {
    const e = item as Record<string, unknown>
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string' || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target) throw new Error('Nieprawidłowa krawędź')
    const weight = Number(e.weight)
    if (!Number.isFinite(weight)) throw new Error('Nieprawidłowa waga krawędzi')
    return makeEdge(e.source, e.target, weight, obj.directed as boolean)
  })
  return { nodes, edges, directed: obj.directed }
}
function serialize(nodes: Node[], edges: Edge[], directed: boolean) {
  return { version: 1, directed, nodes: nodes.map(n => ({ id: n.id, position: n.position })), edges: edges.map(e => ({ source: e.source, target: e.target, weight: Number(e.label ?? 1) })) }
}

export default function GraphEditor() {
  const initial = useRef(sampleGraph())
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.current.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.current.edges)
  const [directed, setDirected] = useState(initial.current.directed)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [weight, setWeight] = useState('1')
  const [start, setStart] = useState('A')
  const [end, setEnd] = useState('F')
  const [message, setMessage] = useState('Gotowe do edycji')
  const [graphName, setGraphName] = useState('Mój graf')
  const [savedGraphs, setSavedGraphs] = useState<SavedGraphInfo[]>([])
  const [savedGraphId, setSavedGraphId] = useState('')
  const [dbBusy, setDbBusy] = useState(false)
  const [instance, setInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const selected = edges.find(e => e.id === selectedEdge)

  useEffect(() => { if (selected) setWeight(String(selected.label ?? 1)) }, [selectedEdge, selected?.label])
  useEffect(() => {
    if (!nodes.some(n => n.id === start)) setStart(nodes[0]?.id ?? '')
    if (!nodes.some(n => n.id === end)) setEnd(nodes[nodes.length - 1]?.id ?? '')
  }, [nodes, start, end])

  const loadGraph = useCallback((doc: GraphDocument) => {
    setNodes(doc.nodes); setEdges(doc.edges); setDirected(doc.directed)
    setSelectedNode(null); setSelectedEdge(null)
    setStart(doc.nodes[0]?.id ?? ''); setEnd(doc.nodes[doc.nodes.length - 1]?.id ?? '')
    window.setTimeout(() => instance?.fitView({ padding: 0.355, duration: 350 }), 50)
  }, [setNodes, setEdges, instance])

  const refreshSavedGraphs = useCallback(async () => {
    try {
      const list = await getSavedGraphs()
      setSavedGraphs(list)
      setSavedGraphId(current => current && list.some(g => String(g.id) === current) ? current : '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się pobrać grafów z bazy')
    }
  }, [])

  useEffect(() => { void refreshSavedGraphs() }, [refreshSavedGraphs])

  const saveToDatabase = async () => {
    const name = graphName.trim()
    if (!name) { setMessage('Wpisz nazwę grafu'); return }
    setDbBusy(true)
    try {
      const result = await saveGraph({
        name, directed,
        nodes: nodes.map(n => ({ id: n.id, position: n.position, data: { label: n.id } })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: String(e.label ?? 1), data: { weight: Number(e.label ?? 1) } })),
      })
      await refreshSavedGraphs()
      setSavedGraphId(String(result.id))
      setMessage(`Zapisano graf „${name}” w bazie SQLite (ID: ${result.id})`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Błąd zapisu grafu')
    } finally { setDbBusy(false) }
  }

  const loadFromDatabase = async () => {
    if (!savedGraphId) { setMessage('Wybierz graf z listy'); return }
    setDbBusy(true)
    try {
      const saved = await getSavedGraph(Number(savedGraphId))
      const document = parseDocument({
        directed: saved.directed,
        nodes: saved.nodes,
        edges: saved.edges.map(e => ({
          source: e.source, target: e.target,
          weight: e.data?.weight ?? e.label ?? 1,
        })),
      })
      loadGraph(document)
      setGraphName(saved.name)
      setMessage(`Wczytano graf „${saved.name}” z SQLite`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Błąd wczytywania grafu')
    } finally { setDbBusy(false) }
  }

  const removeFromDatabase = async () => {
    if (!savedGraphId) { setMessage('Wybierz graf z listy'); return }
    const graph = savedGraphs.find(g => String(g.id) === savedGraphId)
    if (!window.confirm(`Usunąć graf „${graph?.name ?? savedGraphId}” z bazy danych?`)) return
    setDbBusy(true)
    try {
      await deleteSavedGraph(Number(savedGraphId))
      await refreshSavedGraphs()
      setMessage('Usunięto graf z bazy SQLite (graf na ekranie pozostał bez zmian)')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Błąd usuwania grafu')
    } finally { setDbBusy(false) }
  }

  const addNode = useCallback(() => {
    const existing = new Set(nodes.map(n => n.id))
    let id: string
    do { id = `V${++nextId.current}` } while (existing.has(id))
    const center = instance?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 200, y: 200 }
    setNodes(ns => [...ns, makeNode(id, center.x + (nextId.current % 4) * 18, center.y + (nextId.current % 4) * 18)])
    setMessage(`Dodano wierzchołek ${id}`)
  }, [nodes, instance, setNodes])

  const connect = useCallback((connection: Connection) => {
    if (connection.source === connection.target) { setMessage('Pętle własne są wyłączone'); return }
    const exists = edges.some(e => e.source === connection.source && e.target === connection.target || !directed && e.source === connection.target && e.target === connection.source)
    if (exists) { setMessage('Taka krawędź już istnieje'); return }
    setEdges(es => addEdge(makeEdge(connection.source, connection.target, 1, directed), es))
    setMessage('Dodano krawędź z wagą 1')
  }, [edges, directed, setEdges])

  const selectionChanged = useCallback(({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
    setSelectedNode(ns[0]?.id ?? null); setSelectedEdge(es[0]?.id ?? null)
  }, [])

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes(ns => ns.filter(n => n.id !== selectedNode))
      setEdges(es => es.filter(e => e.source !== selectedNode && e.target !== selectedNode))
      setMessage(`Usunięto wierzchołek ${selectedNode}`)
    } else if (selectedEdge) {
      setEdges(es => es.filter(e => e.id !== selectedEdge))
      setMessage('Usunięto krawędź')
    }
    setSelectedNode(null); setSelectedEdge(null)
  }

  const updateWeight = () => {
    const parsed = Number(weight)
    if (!selectedEdge || !weight.trim() || !Number.isFinite(parsed)) { setMessage('Podaj poprawną wagę'); return }
    setEdges(es => es.map(e => e.id === selectedEdge ? { ...e, label: String(parsed) } : e))
    setMessage(`Zmieniono wagę na ${parsed}`)
  }

  const toggleDirected = (value: boolean) => {
    setDirected(value); setEdges(es => es.map(e => decorateEdge(e, value)))
    setMessage(value ? 'Graf skierowany' : 'Graf nieskierowany')
  }

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(nodes, edges, directed))); setMessage('Graf zapisany w przeglądarce') }
    catch { setMessage('Nie udało się zapisać grafu') }
  }
  const restore = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) { setMessage('Brak zapisanego grafu'); return }
      loadGraph(parseDocument(JSON.parse(stored))); setMessage('Wczytano zapisany graf')
    } catch { setMessage('Nie udało się wczytać zapisanego grafu') }
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...serialize(nodes, edges, directed), start, end }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'graphlab-graf.json'; anchor.click()
    URL.revokeObjectURL(url); setMessage('Wyeksportowano plik JSON')
  }
  const importJson = async (file?: File) => {
    if (!file) return
    try { loadGraph(parseDocument(JSON.parse(await file.text()))); setMessage('Zaimportowano graf') }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Błąd importu') }
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div><div className="eyebrow"><Network size={14} /> GRAPH WORKSPACE</div><h1>Edytor grafów</h1><p>Twórz grafy, modyfikuj krawędzie i przygotowuj dane do algorytmów.</p></div>
        <span className="version-pill">Edytor interaktywny</span>
      </div>
      <div className="editor-layout">
        <section className="panel editor-panel">
          <div className="panel-header"><h3><Settings2 size={18} /> Narzędzia grafu</h3></div>
          <div className="editor-tools graph-editor-tools">
            <div className="tool-group-title">EDYCJA</div>
            <button className="ge-action ge-primary" onClick={addNode}><Plus size={17} /> Dodaj wierzchołek</button>
            <div className="ge-hint"><MousePointer2 size={15} /> Połącz punkty, przeciągając od uchwytu jednego wierzchołka do drugiego.</div>
            <button className="ge-action" onClick={deleteSelected} disabled={!selectedNode && !selectedEdge}><Trash2 size={17} /> Usuń zaznaczony element</button>
            {selected && <div className="ge-weight"><label htmlFor="edge-weight">Waga wybranej krawędzi</label><div><input id="edge-weight" type="number" step="any" value={weight} onChange={e => setWeight(e.target.value)} /><button onClick={updateWeight}>Zapisz</button></div></div>}
            <div className="tool-group-title">USTAWIENIA GRAFU</div>
            <label className="ge-field">Typ grafu<select value={directed ? 'directed' : 'undirected'} onChange={e => toggleDirected(e.target.value === 'directed')}><option value="directed">Skierowany</option><option value="undirected">Nieskierowany</option></select></label>
            <div className="tool-setting"><label>Wierzchołki</label><span>{nodes.length}</span></div>
            <div className="tool-setting"><label>Krawędzie</label><span>{edges.length}</span></div>
            <div className="tool-group-title">PUNKTY ALGORYTMU</div>
            <label className="ge-field">Początek<select value={start} onChange={e => setStart(e.target.value)}>{nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></label>
            <label className="ge-field">Koniec<select value={end} onChange={e => setEnd(e.target.value)}>{nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></label>
            <div className="tool-group-title">GRAFY TESTOWE</div>
            <button className="ge-action" onClick={() => { loadGraph(sampleGraph()); setMessage('Wczytano graf przykładowy') }}><GitBranch size={17} /> Graf przykładowy</button>
            <button className="ge-action" onClick={() => { loadGraph(generateRandomGraph(12, 0.25, directed)); setMessage('Wygenerowano losowy graf') }}><Shuffle size={17} /> Graf losowy (12)</button>
            <button className="ge-action" onClick={() => { loadGraph({ nodes: [], edges: [], directed }); setMessage('Wyczyszczono graf') }}><RotateCcw size={17} /> Wyczyść graf</button>
            <div className="tool-group-title">BAZA DANYCH SQLITE</div>
            <label className="ge-field">Nazwa grafu<input type="text" maxLength={120} value={graphName} onChange={e => setGraphName(e.target.value)} placeholder="Nazwa grafu" /></label>
            <button className="ge-action ge-primary" disabled={dbBusy} onClick={() => void saveToDatabase()}><Save size={16} /> Zapisz w bazie</button>
            <label className="ge-field">Zapisane grafy<select value={savedGraphId} onChange={e => setSavedGraphId(e.target.value)} disabled={dbBusy}><option value="">Wybierz zapisany graf</option>{savedGraphs.map(g => <option key={g.id} value={String(g.id)}>{g.name} (ID: {g.id})</option>)}</select></label>
            <button className="ge-action" disabled={dbBusy || !savedGraphId} onClick={() => void loadFromDatabase()}><FileUp size={16} /> Wczytaj z bazy</button>
            <button className="ge-action" disabled={dbBusy || !savedGraphId} onClick={() => void removeFromDatabase()}><Trash2 size={16} /> Usuń z bazy</button>
            <button className="ge-action" disabled={dbBusy} onClick={() => void refreshSavedGraphs()}><RotateCcw size={16} /> Odśwież listę</button>
            <div className="tool-group-title">PLIKI I ZAPIS LOKALNY</div>
            <div className="ge-actions-two"><button className="ge-action" onClick={save}><Save size={16} /> Zapisz</button><button className="ge-action" onClick={restore}><FileUp size={16} /> Wczytaj</button></div>
            <div className="ge-actions-two"><button className="ge-action" onClick={exportJson}><Download size={16} /> Eksport</button><button className="ge-action" onClick={() => fileInput.current?.click()}><FileUp size={16} /> Import</button></div>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => void importJson(e.target.files?.[0])} />
          </div>
        </section>
        <section className="panel editor-canvas">
          <div className="panel-header"><h3><Network size={18} /> Obszar roboczy</h3><span className="section-chip">{directed ? 'Graf skierowany' : 'Graf nieskierowany'}</span></div>
          <div className="ge-flow"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onSelectionChange={selectionChanged} onInit={setInstance} fitView fitViewOptions={{ padding: 0.35 }} minZoom={0.2} maxZoom={2} deleteKeyCode={null} proOptions={{ hideAttribution: true }}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155" /><Controls showInteractive={false} /></ReactFlow></div>
          <div className="ge-status"><span>{message}</span><span><strong>{selectedNode ? `Wierzchołek ${selectedNode}` : selected ? `Krawędź ${selected.source} → ${selected.target}` : 'Brak zaznaczenia'}</strong></span></div>
        </section>
      </div>
    </div>
  )
}
