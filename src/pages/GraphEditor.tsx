import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from '@xyflow/react'
import GraphVertexNode from '../components/GraphVertexNode'
import {
  Download,
  FileUp,
  GitBranch,
  GitCompare,
  LayoutGrid,
  MousePointer2,
  Network,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Shuffle,
  Trash2,
  Undo2,
} from 'lucide-react'
import { generateRandomGraph, sampleGraph, type GraphDocument } from '../utils/graphData'
import { DEMO_GRAPHS } from '../utils/demoGraphs'
import { getSavedGraphs, getSavedGraph, saveGraph, deleteSavedGraph, type SavedGraphInfo } from '../services/graphApi'
import {
  autoLayoutPositions,
  decorateEdge,
  loadWorkspace,
  makeEditorEdge,
  makeEditorNode,
  nextVertexId,
  parseWorkspace,
  saveWorkspace,
  serializeWorkspace,
  workspaceToFlow,
} from '../workspace/graphWorkspace'
import './GraphEditor.css'

type HistorySnapshot = {
  nodes: Node[]
  edges: Edge[]
  directed: boolean
}

type ToolMode = 'select' | 'place'

const HISTORY_LIMIT = 60

const editorNodeTypes = {
  graphVertex: GraphVertexNode,
}

function cloneSnapshot(nodes: Node[], edges: Edge[], directed: boolean): HistorySnapshot {
  return {
    directed,
    nodes: nodes.map(n => ({ ...n, position: { ...n.position }, data: { ...n.data }, style: { ...n.style } })),
    edges: edges.map(e => ({ ...e, style: { ...e.style }, markerEnd: e.markerEnd })),
  }
}

export default function GraphEditor() {
  const navigate = useNavigate()
  const bootstrapped = useRef(false)
  const initialDoc = useRef<GraphDocument | null>(null)
  if (!bootstrapped.current) {
    bootstrapped.current = true
    const stored = loadWorkspace()
    initialDoc.current = stored ? workspaceToFlow(stored) : { nodes: [], edges: [], directed: true }
  }

  const seed = initialDoc.current!
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(seed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(seed.edges)
  const [directed, setDirected] = useState(seed.directed)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [weight, setWeight] = useState('1')
  const [nodeName, setNodeName] = useState('')
  const [start, setStart] = useState(seed.nodes[0]?.id ?? '')
  const [end, setEnd] = useState(seed.nodes.at(-1)?.id ?? '')
  const [message, setMessage] = useState(
    seed.nodes.length
      ? 'Wczytano ostatnio edytowany graf. Możesz kontynuować pracę lub utworzyć pusty graf.'
      : 'Pusty obszar roboczy. Włącz tryb „Dodaj kliknięciem” albo użyj przycisku „Dodaj wierzchołek”.',
  )
  const [graphName, setGraphName] = useState('Mój graf')
  const [savedGraphs, setSavedGraphs] = useState<SavedGraphInfo[]>([])
  const [savedGraphId, setSavedGraphId] = useState('')
  const [dbBusy, setDbBusy] = useState(false)
  const [toolMode, setToolMode] = useState<ToolMode>('place')
  const [instance, setInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const [historyTick, setHistoryTick] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const past = useRef<HistorySnapshot[]>([])
  const future = useRef<HistorySnapshot[]>([])
  const skipHistory = useRef(false)
  const selected = edges.find(e => e.id === selectedEdge)
  const selectedNodeObj = nodes.find(n => n.id === selectedNode)

  useEffect(() => {
    if (selected) setWeight(String(selected.label ?? 1))
  }, [selectedEdge, selected?.label])

  useEffect(() => {
    if (selectedNodeObj) setNodeName(String(selectedNodeObj.data?.label ?? selectedNodeObj.id))
  }, [selectedNode, selectedNodeObj])

  useEffect(() => {
    if (!nodes.some(n => n.id === start)) setStart(nodes[0]?.id ?? '')
    if (!nodes.some(n => n.id === end)) setEnd(nodes[nodes.length - 1]?.id ?? '')
  }, [nodes, start, end])

  const pushHistory = useCallback(() => {
    if (skipHistory.current) return
    past.current.push(cloneSnapshot(nodes, edges, directed))
    if (past.current.length > HISTORY_LIMIT) past.current.shift()
    future.current = []
    setHistoryTick(value => value + 1)
  }, [nodes, edges, directed])

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    skipHistory.current = true
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setDirected(snapshot.directed)
    setSelectedNode(null)
    setSelectedEdge(null)
    setHistoryTick(value => value + 1)
    window.setTimeout(() => { skipHistory.current = false }, 0)
  }, [setNodes, setEdges])

  const canUndo = historyTick >= 0 && past.current.length > 0
  const canRedo = historyTick >= 0 && future.current.length > 0

  const undo = () => {
    const previous = past.current.pop()
    if (!previous) { setMessage('Brak wcześniejszych zmian do cofnięcia.'); return }
    future.current.push(cloneSnapshot(nodes, edges, directed))
    applySnapshot(previous)
    setMessage('Cofnięto ostatnią zmianę.')
  }

  const redo = () => {
    const next = future.current.pop()
    if (!next) { setMessage('Brak zmian do ponowienia.'); return }
    past.current.push(cloneSnapshot(nodes, edges, directed))
    applySnapshot(next)
    setMessage('Ponowiono zmianę.')
  }

  const persistLocal = useCallback((nextNodes = nodes, nextEdges = edges, nextDirected = directed) => {
    saveWorkspace(serializeWorkspace(nextNodes, nextEdges, nextDirected, start, end), { source: 'editor' })
  }, [nodes, edges, directed, start, end])

  const loadGraph = useCallback((doc: GraphDocument, note?: string) => {
    pushHistory()
    setNodes(doc.nodes)
    setEdges(doc.edges)
    setDirected(doc.directed)
    setSelectedNode(null)
    setSelectedEdge(null)
    setStart(doc.nodes[0]?.id ?? '')
    setEnd(doc.nodes[doc.nodes.length - 1]?.id ?? '')
    setMessage(note ?? 'Wczytano graf.')
    window.setTimeout(() => instance?.fitView({ padding: 0.35, duration: 350 }), 50)
  }, [pushHistory, setNodes, setEdges, instance])

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
        name,
        directed,
        nodes: nodes.map(n => ({ id: n.id, position: n.position, data: { label: n.id } })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: String(e.label ?? 1),
          data: { weight: Number(e.label ?? 1) },
        })),
      })
      await refreshSavedGraphs()
      setSavedGraphId(String(result.id))
      persistLocal()
      setMessage(`Zapisano graf „${name}” w bazie SQLite (ID: ${result.id})`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Błąd zapisu grafu')
    } finally {
      setDbBusy(false)
    }
  }

  const loadFromDatabase = async () => {
    if (!savedGraphId) { setMessage('Wybierz graf z listy'); return }
    setDbBusy(true)
    try {
      const saved = await getSavedGraph(Number(savedGraphId))
      const document = workspaceToFlow(parseWorkspace({
        directed: saved.directed,
        nodes: saved.nodes,
        edges: saved.edges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.data?.weight ?? e.label ?? 1,
        })),
      }))
      loadGraph(document, `Wczytano graf „${saved.name}” z SQLite`)
      setGraphName(saved.name)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Błąd wczytywania grafu')
    } finally {
      setDbBusy(false)
    }
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
    } finally {
      setDbBusy(false)
    }
  }

  const addNodeAt = useCallback((x: number, y: number) => {
    pushHistory()
    const id = nextVertexId(nodes.map(n => n.id))
    const next = [...nodes, makeEditorNode(id, x, y)]
    setNodes(next)
    setSelectedNode(id)
    setSelectedEdge(null)
    setMessage(`Dodano wierzchołek ${id}. Możesz zmienić jego nazwę w panelu po lewej.`)
  }, [nodes, pushHistory, setNodes])

  const addNode = () => {
    const center = instance?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      ?? { x: 220 + nodes.length * 24, y: 180 + (nodes.length % 5) * 20 }
    addNodeAt(center.x, center.y)
  }

  const onPaneClick = useCallback((event: ReactMouseEvent) => {
    if (toolMode !== 'place' || !instance) return
    const point = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    addNodeAt(point.x - 27, point.y - 27)
  }, [toolMode, instance, addNodeAt])

  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) {
      setMessage('Pętle własne są wyłączone. Połącz dwa różne wierzchołki.')
      return
    }
    const exists = edges.some(e =>
      (e.source === connection.source && e.target === connection.target)
      || (!directed && e.source === connection.target && e.target === connection.source),
    )
    if (exists) {
      setMessage('Taka krawędź już istnieje. Równoległe krawędzie między tą samą parą nie są obsługiwane.')
      return
    }
    pushHistory()
    setEdges(es => addEdge(
      makeEditorEdge(connection.source!, connection.target!, 1, directed, {
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      }),
      es,
    ))
    setMessage(`Dodano krawędź ${connection.source} → ${connection.target} z wagą 1. Możesz ustawić wagę dodatnią, zero lub ujemną.`)
  }, [edges, directed, pushHistory, setEdges])

  const selectionChanged = useCallback(({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
    setSelectedNode(ns[0]?.id ?? null)
    setSelectedEdge(es[0]?.id ?? null)
  }, [])

  const deleteSelected = () => {
    if (!selectedNode && !selectedEdge) return
    pushHistory()
    if (selectedNode) {
      setNodes(ns => ns.filter(n => n.id !== selectedNode))
      setEdges(es => es.filter(e => e.source !== selectedNode && e.target !== selectedNode))
      setMessage(`Usunięto wierzchołek ${selectedNode} wraz z powiązanymi krawędziami.`)
    } else if (selectedEdge) {
      setEdges(es => es.filter(e => e.id !== selectedEdge))
      setMessage('Usunięto zaznaczoną krawędź.')
    }
    setSelectedNode(null)
    setSelectedEdge(null)
  }

  const updateWeight = () => {
    const parsed = Number(weight)
    if (!selectedEdge || !weight.trim() || !Number.isFinite(parsed)) {
      setMessage('Podaj poprawną wagę liczbową. Dozwolone są wartości dodatnie, zero i ujemne.')
      return
    }
    pushHistory()
    setEdges(es => es.map(e => e.id === selectedEdge ? { ...e, label: String(parsed) } : e))
    setMessage(`Zmieniono wagę krawędzi na ${parsed}.`)
  }

  const renameSelectedNode = () => {
    if (!selectedNode) return
    const nextId = nodeName.trim()
    if (!nextId) { setMessage('Nazwa wierzchołka nie może być pusta.'); return }
    if (nodes.some(n => n.id !== selectedNode && n.id === nextId)) {
      setMessage(`Wierzchołek o nazwie „${nextId}” już istnieje. Wybierz inną nazwę.`)
      return
    }
    pushHistory()
    setNodes(ns => ns.map(n => n.id === selectedNode
      ? { ...n, id: nextId, data: { ...n.data, label: nextId } }
      : n))
    setEdges(es => es.map(e => ({
      ...e,
      source: e.source === selectedNode ? nextId : e.source,
      target: e.target === selectedNode ? nextId : e.target,
    })))
    if (start === selectedNode) setStart(nextId)
    if (end === selectedNode) setEnd(nextId)
    setSelectedNode(nextId)
    setMessage(`Zmieniono nazwę wierzchołka na ${nextId}.`)
  }

  const toggleDirected = (value: boolean) => {
    pushHistory()
    setDirected(value)
    setEdges(es => es.map(e => decorateEdge(e, value)))
    setMessage(value
      ? 'Graf skierowany: strzałki pokazują kierunek krawędzi.'
      : 'Graf nieskierowany: połączenia działają w obie strony.')
  }

  const autoLayout = () => {
    if (!nodes.length) { setMessage('Najpierw dodaj wierzchołki.'); return }
    pushHistory()
    const positions = autoLayoutPositions(nodes.length)
    setNodes(ns => ns.map((n, index) => ({ ...n, position: positions[index] })))
    window.setTimeout(() => instance?.fitView({ padding: 0.35, duration: 350 }), 40)
    setMessage('Rozmieszczono wierzchołki automatycznie na okręgu.')
  }

  const newEmpty = () => {
    pushHistory()
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    setSelectedEdge(null)
    setStart('')
    setEnd('')
    setMessage('Utworzono pusty graf. Dodawaj wierzchołki kliknięciem na płótnie.')
    setToolMode('place')
  }

  const save = () => {
    try {
      persistLocal()
      setMessage('Graf zapisany lokalnie w przeglądarce.')
    } catch {
      setMessage('Nie udało się zapisać grafu.')
    }
  }

  const restore = () => {
    try {
      const stored = loadWorkspace()
      if (!stored) { setMessage('Brak zapisanego grafu.'); return }
      loadGraph(workspaceToFlow(stored), 'Wczytano zapisany graf lokalny.')
      if (stored.start) setStart(stored.start)
      if (stored.end) setEnd(stored.end)
    } catch {
      setMessage('Nie udało się wczytać zapisanego grafu.')
    }
  }

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ ...serializeWorkspace(nodes, edges, directed, start, end) }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'graphlab-graf.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('Wyeksportowano plik JSON.')
  }

  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const parsed = parseWorkspace(JSON.parse(await file.text()))
      loadGraph(workspaceToFlow(parsed), 'Zaimportowano graf z pliku.')
      if (parsed.start) setStart(parsed.start)
      if (parsed.end) setEnd(parsed.end)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Błąd importu')
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const visualize = () => {
    if (!nodes.length) {
      setMessage('Dodaj przynajmniej jeden wierzchołek, zanim przejdziesz do wizualizacji.')
      return
    }
    saveWorkspace(serializeWorkspace(nodes, edges, directed, start || nodes[0]?.id, end || nodes.at(-1)?.id), {
      source: 'editor',
      openInAlgorithms: true,
    })
    navigate('/algorithms', { state: { fromEditor: true } })
  }

  const compare = () => {
    if (!nodes.length) {
      setMessage('Dodaj przynajmniej jeden wierzchołek, zanim przejdziesz do porównania.')
      return
    }
    saveWorkspace(serializeWorkspace(nodes, edges, directed, start || nodes[0]?.id, end || nodes.at(-1)?.id), {
      source: 'editor',
      openInComparison: true,
    })
    navigate('/comparison', { state: { fromEditor: true } })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNode || selectedEdge)) {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode, selectedEdge, nodes, edges, directed])

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><Network size={14} /> GRAPH WORKSPACE</div>
          <h1>Edytor grafów</h1>
          <p>Twórz i edytuj grafy, a następnie jednym kliknięciem przejdź do wizualizacji algorytmów.</p>
        </div>
        <div className="heading-actions">
          <button className="btn btn-outline" onClick={compare}>
            <GitCompare size={16} /> Porównaj algorytmy
          </button>
          <button className="btn btn-primary" onClick={visualize}>
            <Play size={16} /> Wizualizuj ten graf
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <section className="panel editor-panel">
          <div className="panel-header"><h3><Settings2 size={18} /> Narzędzia grafu</h3></div>
          <div className="editor-tools graph-editor-tools">
            <div className="ge-help">
              <strong>Jak zacząć?</strong>
              <ol>
                <li>Włącz tryb „Dodaj kliknięciem” i kliknij na płótnie.</li>
                <li>Przeciągnij od dowolnego z 4 uchwytów (góra/dół/lewo/prawo) do uchwytu drugiego wierzchołka.</li>
                <li>Zaznacz element, aby zmienić nazwę lub wagę.</li>
                <li>Kliknij „Wizualizuj ten graf” lub „Porównaj algorytmy”, aby przejść dalej.</li>
              </ol>
              <p>Pętle własne i krawędzie równoległe są zablokowane. Wagi mogą być dodatnie, zerowe lub ujemne.</p>
            </div>

            <div className="tool-group-title">TRYB PRACY</div>
            <div className="ge-actions-two">
              <button className={`ge-action ${toolMode === 'place' ? 'ge-primary' : ''}`} onClick={() => setToolMode('place')}>
                <Plus size={16} /> Dodaj kliknięciem
              </button>
              <button className={`ge-action ${toolMode === 'select' ? 'ge-primary' : ''}`} onClick={() => setToolMode('select')}>
                <MousePointer2 size={16} /> Zaznaczaj
              </button>
            </div>
            <div className="ge-hint">
              <MousePointer2 size={15} />
              {toolMode === 'place'
                ? 'Kliknij puste miejsce na płótnie, aby dodać wierzchołek.'
                : 'Przeciągaj wierzchołki i łącz je uchwytami. Delete usuwa zaznaczenie.'}
            </div>

            <div className="tool-group-title">EDYCJA</div>
            <button className="ge-action" onClick={addNode}><Plus size={17} /> Dodaj wierzchołek</button>
            <button className="ge-action" onClick={deleteSelected} disabled={!selectedNode && !selectedEdge}>
              <Trash2 size={17} /> Usuń zaznaczony element
            </button>
            <div className="ge-actions-two">
              <button className="ge-action" onClick={undo} disabled={!canUndo}><Undo2 size={16} /> Cofnij</button>
              <button className="ge-action" onClick={redo} disabled={!canRedo}><Redo2 size={16} /> Ponów</button>
            </div>

            {selectedNodeObj && (
              <div className="ge-weight">
                <label htmlFor="node-name">Nazwa wierzchołka</label>
                <div>
                  <input id="node-name" value={nodeName} onChange={e => setNodeName(e.target.value)} />
                  <button type="button" onClick={renameSelectedNode}>Zapisz</button>
                </div>
              </div>
            )}

            {selected && (
              <div className="ge-weight">
                <label htmlFor="edge-weight">Waga wybranej krawędzi</label>
                <div>
                  <input id="edge-weight" type="number" step="any" value={weight} onChange={e => setWeight(e.target.value)} />
                  <button type="button" onClick={updateWeight}>Zapisz</button>
                </div>
              </div>
            )}

            <div className="tool-group-title">USTAWIENIA GRAFU</div>
            <label className="ge-field">
              Typ grafu
              <select value={directed ? 'directed' : 'undirected'} onChange={e => toggleDirected(e.target.value === 'directed')}>
                <option value="directed">Skierowany</option>
                <option value="undirected">Nieskierowany</option>
              </select>
            </label>
            <div className="tool-setting"><label>Wierzchołki</label><span>{nodes.length}</span></div>
            <div className="tool-setting"><label>Krawędzie</label><span>{edges.length}</span></div>
            <button className="ge-action" onClick={autoLayout} disabled={!nodes.length}>
              <LayoutGrid size={16} /> Automatyczne rozmieszczenie
            </button>

            <div className="tool-group-title">PUNKTY ALGORYTMU</div>
            <label className="ge-field">
              Początek
              <select value={start} onChange={e => setStart(e.target.value)} disabled={!nodes.length}>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
              </select>
            </label>
            <label className="ge-field">
              Cel (opcjonalny)
              <select value={end} onChange={e => setEnd(e.target.value)} disabled={!nodes.length}>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
              </select>
            </label>

            <div className="tool-group-title">GRAFY TESTOWE</div>
            <button className="ge-action" onClick={newEmpty}><Trash2 size={16} /> Nowy pusty graf</button>
            <button className="ge-action" onClick={() => loadGraph(sampleGraph(), 'Wczytano graf przykładowy.')}>
              <GitBranch size={17} /> Graf przykładowy
            </button>
            {DEMO_GRAPHS.map(demo => (
              <button
                key={demo.id}
                className="ge-action"
                onClick={() => {
                  const built = demo.build()
                  loadGraph(built, `Wczytano przykład: ${demo.label}.`)
                  setStart(demo.start)
                  setEnd(demo.end)
                }}
              >
                <GitBranch size={16} /> {demo.label}
              </button>
            ))}
            <button className="ge-action" onClick={() => loadGraph(generateRandomGraph(12, 0.25, directed), 'Wygenerowano losowy graf.')}>
              <Shuffle size={17} /> Graf losowy (12)
            </button>
            <button className="ge-action" onClick={() => { loadGraph({ nodes: [], edges: [], directed }); setMessage('Wyczyszczono graf') }}>
              <RotateCcw size={17} /> Wyczyść graf
            </button>

            <div className="tool-group-title">WIZUALIZACJA</div>
            <button className="ge-action ge-primary" onClick={visualize}>
              <Play size={16} /> Wizualizuj ten graf
            </button>
            <button className="ge-action" onClick={compare}>
              <GitCompare size={16} /> Porównaj algorytmy
            </button>
            <Link className="ge-action" to="/algorithms">Przejdź do modułu algorytmów</Link>
            <Link className="ge-action" to="/comparison">Przejdź do porównania</Link>

            <div className="tool-group-title">BAZA DANYCH SQLITE</div>
            <label className="ge-field">
              Nazwa grafu
              <input type="text" maxLength={120} value={graphName} onChange={e => setGraphName(e.target.value)} placeholder="Nazwa grafu" />
            </label>
            <button className="ge-action ge-primary" disabled={dbBusy} onClick={() => void saveToDatabase()}>
              <Save size={16} /> Zapisz w bazie
            </button>
            <label className="ge-field">
              Zapisane grafy
              <select value={savedGraphId} onChange={e => setSavedGraphId(e.target.value)} disabled={dbBusy}>
                <option value="">Wybierz zapisany graf</option>
                {savedGraphs.map(g => <option key={g.id} value={String(g.id)}>{g.name} (ID: {g.id})</option>)}
              </select>
            </label>
            <button className="ge-action" disabled={dbBusy || !savedGraphId} onClick={() => void loadFromDatabase()}>
              <FileUp size={16} /> Wczytaj z bazy
            </button>
            <button className="ge-action" disabled={dbBusy || !savedGraphId} onClick={() => void removeFromDatabase()}>
              <Trash2 size={16} /> Usuń z bazy
            </button>
            <button className="ge-action" disabled={dbBusy} onClick={() => void refreshSavedGraphs()}>
              <RotateCcw size={16} /> Odśwież listę
            </button>

            <div className="tool-group-title">PLIKI I ZAPIS LOKALNY</div>
            <div className="ge-actions-two">
              <button className="ge-action" onClick={save}><Save size={16} /> Zapisz</button>
              <button className="ge-action" onClick={restore}><FileUp size={16} /> Wczytaj</button>
            </div>
            <div className="ge-actions-two">
              <button className="ge-action" onClick={exportJson}><Download size={16} /> Eksport</button>
              <button className="ge-action" onClick={() => fileInput.current?.click()}><FileUp size={16} /> Import</button>
            </div>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => void importJson(e.target.files?.[0])} />
          </div>
        </section>

        <section className="panel editor-canvas">
          <div className="panel-header">
            <h3><Network size={18} /> Obszar roboczy</h3>
            <span className="section-chip">{directed ? 'Graf skierowany' : 'Graf nieskierowany'} · {toolMode === 'place' ? 'tryb dodawania' : 'tryb zaznaczania'}</span>
          </div>
          <div className="ge-flow">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={editorNodeTypes}
              connectionMode={ConnectionMode.Loose}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connect}
              isValidConnection={connection => Boolean(
                connection.source
                && connection.target
                && connection.source !== connection.target,
              )}
              onSelectionChange={selectionChanged}
              onPaneClick={onPaneClick}
              onNodeDragStart={() => pushHistory()}
              onInit={setInstance}
              fitView
              fitViewOptions={{ padding: 0.35 }}
              minZoom={0.2}
              maxZoom={2}
              nodesDraggable={toolMode === 'select' || toolMode === 'place'}
              elementsSelectable
              deleteKeyCode={null}
              panOnDrag={toolMode === 'select'}
              selectionOnDrag={toolMode === 'select'}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#334155" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="ge-status">
            <span>{message}</span>
            <span>
              <strong>
                {selectedNode
                  ? `Wierzchołek ${selectedNode}`
                  : selected
                    ? `Krawędź ${selected.source} → ${selected.target}`
                    : 'Brak zaznaczenia'}
              </strong>
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
