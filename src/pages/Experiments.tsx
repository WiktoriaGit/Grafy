import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Download,
  FlaskConical,
  Network,
  Play,
  Trash2,
} from 'lucide-react'
import {
  algorithmLabels,
  BENCHMARK_TASK_HINTS,
  exportCSV,
  loadResults,
  saveResults,
  workspaceToBenchGraph,
  type AlgorithmId,
  type BenchResult,
  type BenchmarkRequest,
} from '../utils/benchmark'
import {
  ALL_BENCHMARK_ALGORITHMS,
  ALGORITHM_PROBLEM_GROUP,
  PROBLEM_GROUP_LABELS,
  inspectBenchGraph,
  preflightAlgorithms,
} from '../utils/benchEligibility'
import { COMPLEXITY_COMPARISON_NOTE } from '../utils/complexityCatalog'
import {
  estimateEdgeCount,
  graphSizes,
  MAX_EDGES,
  MAX_VERTICES,
  topologyLabels,
  validateGeneratorParams,
  type GraphTopology,
} from '../utils/largeGraphs'
import {
  buildPairComparison,
  methodologyWarnings,
  type DistanceAgreement,
  type PairComparison,
} from '../utils/pairCompare'
import {
  buildGroupInsights,
  complexityLabel,
  statusLabel,
} from '../utils/experimentInsights'
import { listLibraryGraphs, getLibraryGraph } from '../library/graphLibrary'
import { loadWorkspace } from '../workspace/graphWorkspace'
import { saveExperimentsBestEffort } from '../services/graphApi'
import GraphLibraryPanel from '../components/GraphLibraryPanel'
import './Experiments.css'

type GraphSource = 'generator' | 'editor' | 'library'
type SelectMode = 'pair' | 'multi' | 'all'

const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const OPERATIONS_HINT =
  'Operacje benchmarku: licznik wewnętrznych przejść/relaksacji w lean-implementacji Web Workera (nie kroki animacji).'

const topologies: GraphTopology[] = ['erdos', 'complete', 'grid', 'tree', 'path', 'cycle']

export default function Experiments() {
  const location = useLocation()
  const scenarioSizes = new URLSearchParams(location.search).get('scenario') === 'sizes'
  const [topology, setTopology] = useState<GraphTopology>(scenarioSizes ? 'path' : 'erdos')
  const [vertices, setVertices] = useState(1000)
  const [seed, setSeed] = useState(12345)
  const [density, setDensity] = useState(10)
  const [edgeCountMode, setEdgeCountMode] = useState<'density' | 'exact'>('density')
  const [exactEdges, setExactEdges] = useState(200)
  const [weightMin, setWeightMin] = useState(1)
  const [weightMax, setWeightMax] = useState(20)
  const [directed, setDirected] = useState(false)
  const [repetitions, setRepetitions] = useState(scenarioSizes ? 5 : 10)
  const [graphSource, setGraphSource] = useState<GraphSource>('generator')
  const [libraryId, setLibraryId] = useState('')
  const [mode, setMode] = useState<SelectMode>('all')
  const [pairA, setPairA] = useState<AlgorithmId>('dijkstra')
  const [pairB, setPairB] = useState<AlgorithmId>('bellman')
  const [multiSelected, setMultiSelected] = useState<AlgorithmId[]>([...ALL_BENCHMARK_ALGORITHMS])
  const [results, setResults] = useState<BenchResult[]>(loadResults)
  const [lastBatch, setLastBatch] = useState<BenchResult[] | null>(null)
  const [lastPair, setLastPair] = useState<PairComparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(
    scenarioSizes
      ? 'Scenariusz F: uruchom pomiary dla 100, potem 1000, potem 10 000 wierzchołków.'
      : 'Wybierz źródło grafu i algorytmy. Przed startem zobaczysz status gotowości / pominięcia.',
  )
  const [progress, setProgress] = useState(0)
  const [storageNote, setStorageNote] = useState(
    'Wyniki: localStorage (graphlab-benchmarks-v2). SQLite, gdy API :3001 działa.',
  )
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  const selected = mode === 'pair'
    ? [pairA, pairB]
    : mode === 'all'
      ? [...ALL_BENCHMARK_ALGORITHMS]
      : multiSelected

  const pairMethodNotes = useMemo(() => methodologyWarnings(pairA, pairB), [pairA, pairB])
  const libraryEntries = useMemo(() => listLibraryGraphs(), [results, libraryId, graphSource])

  const generatorParams = useMemo(() => ({
    topology,
    vertices,
    densityPercent: density,
    edgeCount: edgeCountMode === 'exact' && topology === 'erdos' ? exactEdges : undefined,
    seed,
    weightMin,
    weightMax,
    directed,
  }), [topology, vertices, density, edgeCountMode, exactEdges, seed, weightMin, weightMax, directed])

  const customPrep = useMemo(() => {
    try {
      if (graphSource === 'editor') {
        const ws = loadWorkspace()
        if (!ws) return { ok: false as const, message: 'Brak grafu w obszarze roboczym edytora.' }
        const graph = workspaceToBenchGraph(ws)
        const facts = inspectBenchGraph(graph, ws.directed)
        return {
          ok: true as const,
          graph,
          facts,
          directed: ws.directed,
          sourceLabel: 'edytor (workspace)',
        }
      }
      if (graphSource === 'library') {
        if (!libraryId) return { ok: false as const, message: 'Wybierz graf z biblioteki.' }
        const entry = getLibraryGraph(libraryId)
        if (!entry) return { ok: false as const, message: 'Nie znaleziono wybranego grafu w bibliotece.' }
        const graph = workspaceToBenchGraph(entry.graph)
        const facts = inspectBenchGraph(graph, entry.graph.directed)
        return {
          ok: true as const,
          graph,
          facts,
          directed: entry.graph.directed,
          sourceLabel: `biblioteka: ${entry.name}`,
        }
      }
      return null
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : 'Błąd przygotowania grafu.' }
    }
  }, [graphSource, libraryId, results])

  const expectedEdges = graphSource === 'generator'
    ? estimateEdgeCount(generatorParams)
    : customPrep && customPrep.ok
      ? customPrep.facts.edges
      : 0

  const validation = graphSource === 'generator'
    ? validateGeneratorParams(generatorParams)
    : customPrep
      ? (customPrep.ok ? { ok: true as const } : { ok: false as const, message: customPrep.message })
      : { ok: false as const, message: 'Nieprawidłowe źródło grafu.' }

  const factsForPreflight = useMemo(() => {
    if (graphSource === 'generator') {
      return {
        vertices,
        edges: expectedEdges,
        directed,
        weightMin,
        weightMax,
        hasNegativeWeight: weightMin < 0,
        undirectedNegativeImpliesCycle: !directed && weightMin < 0,
      }
    }
    if (customPrep && customPrep.ok) return customPrep.facts
    return null
  }, [graphSource, vertices, expectedEdges, directed, weightMin, weightMax, customPrep])

  const preflight = useMemo(() => {
    if (!factsForPreflight) return []
    return preflightAlgorithms(selected, factsForPreflight)
  }, [selected, factsForPreflight])

  const readyCount = preflight.filter(p => p.eligibility.ok).length
  const groupInsights = useMemo(
    () => (lastBatch ? buildGroupInsights(lastBatch) : []),
    [lastBatch],
  )

  const toggle = (id: AlgorithmId) => {
    setMultiSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const cancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setBusy(false)
    setProgress(0)
    setStatus('Anulowano obliczenia. Częściowe wyniki z tej sesji nie zostały zapisane.')
  }

  const run = () => {
    if (mode === 'pair' && pairA === pairB) {
      setStatus('W trybie pary wybierz dwa różne algorytmy.')
      return
    }
    if (!selected.length) {
      setStatus('Wybierz przynajmniej jeden algorytm.')
      return
    }
    if (!validation.ok) {
      setStatus('message' in validation ? validation.message : 'Nieprawidłowa konfiguracja.')
      return
    }
    if (readyCount === 0) {
      setStatus('Żaden z wybranych algorytmów nie jest gotowy do uruchomienia na tym grafie.')
      return
    }

    setBusy(true)
    setProgress(2)
    setLastPair(null)
    setLastBatch(null)
    setStatus('Uruchamianie Web Workera — wspólny graf dla wszystkich wybranych algorytmów...')
    const worker = new Worker(new URL('../workers/benchmark.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    worker.onmessage = (event: MessageEvent<{
      type: string
      message?: string
      percent?: number
      results?: BenchResult[]
      edges?: number
      generateMs?: number
      distanceAgreement?: DistanceAgreement
      runId?: string
    }>) => {
      const message = event.data
      if (message.type === 'progress') {
        setStatus(message.message || 'Trwa obliczanie...')
        if (typeof message.percent === 'number') setProgress(message.percent)
        return
      }
      if (message.type === 'complete') {
        const next = message.results || []
        setLastBatch(next)
        setResults(previous => {
          const all = [...next, ...previous].slice(0, 200)
          saveResults(all)
          return all
        })
        void saveExperimentsBestEffort(next.filter(r => (r.status ?? 'ran') === 'ran').map(r => ({
          algorithm: r.algorithm,
          vertexCount: r.vertices,
          edgeCount: r.edges,
          density: r.density,
          repetitions: r.repetitions,
          seed: r.seed,
          meanMs: r.mean,
          minMs: r.min,
          maxMs: r.max,
          operations: r.operations,
        }))).then(info => setStorageNote(info.message))

        if (mode === 'pair') {
          const left = next.find(r => r.algorithm === pairA)
          const right = next.find(r => r.algorithm === pairB)
          if (left && right && (left.status ?? 'ran') === 'ran' && (right.status ?? 'ran') === 'ran') {
            setLastPair(buildPairComparison(left, right, {
              distanceAgreement: message.distanceAgreement,
            }))
          }
        }

        setProgress(100)
        const ran = next.filter(r => (r.status ?? 'ran') === 'ran').length
        const skipped = next.length - ran
        setStatus(
          `Zakończono: ${ran} wykonano, ${skipped} pominięto/błąd · ${message.edges} krawędzi · gen. ${fmt(message.generateMs ?? 0)} ms.`
          + (message.distanceAgreement ? ` ${message.distanceAgreement.message}` : ''),
        )
      } else {
        setStatus(message.message || 'Błąd eksperymentu.')
        setProgress(0)
      }
      worker.terminate()
      workerRef.current = null
      setBusy(false)
    }

    worker.onerror = () => {
      setStatus('Błąd wątku obliczeniowego.')
      worker.terminate()
      workerRef.current = null
      setBusy(false)
      setProgress(0)
    }

    let request: BenchmarkRequest
    if (graphSource === 'generator') {
      request = {
        source: 'generator',
        ...generatorParams,
        repetitions,
        selected,
        runId,
        sourceLabel: `generator · ${topologyLabels[topology]}`,
      }
    } else if (customPrep && customPrep.ok) {
      request = {
        source: 'custom',
        graph: customPrep.graph,
        directed: customPrep.directed,
        topology: 'custom',
        weightMin: customPrep.facts.weightMin,
        weightMax: customPrep.facts.weightMax,
        seed: 0,
        repetitions,
        selected,
        runId,
        sourceLabel: customPrep.sourceLabel,
        generateMs: 0,
      }
    } else {
      setBusy(false)
      setStatus(customPrep && !customPrep.ok ? customPrep.message : 'Nie udało się przygotować grafu.')
      worker.terminate()
      return
    }

    worker.postMessage(request)
  }

  const clear = () => {
    if (!window.confirm('Usunąć historię pomiarów z przeglądarki?')) return
    setResults([])
    setLastBatch(null)
    setLastPair(null)
    saveResults([])
    setStatus('Historia lokalna usunięta.')
  }

  const openBatch = (runId: string) => {
    const batch = results.filter(r => r.runId === runId)
    if (batch.length) {
      setLastBatch(batch)
      setStatus(`Przywrócono zestawienie sesji ${runId}.`)
    }
  }

  const chartRows = (lastBatch ?? []).filter(r => (r.status ?? 'ran') === 'ran')
  const maxMean = Math.max(...chartRows.map(r => r.mean), 0.001)
  const runIds = useMemo(() => {
    const ids = [...new Set(results.map(r => r.runId).filter(Boolean))] as string[]
    return ids.slice(0, 12)
  }, [results])

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><FlaskConical size={14} /> PERFORMANCE LAB</div>
          <h1>Eksperymenty wydajnościowe</h1>
          <p>
            Benchmark mierzy lean-implementacje z <code>benchmark.ts</code> w Web Workerze — bez kroków animacji i bez React Flow.
            To <b>nie</b> jest ten sam kod, który oglądasz w wizualizacji edukacyjnej. Źródło grafu: generator, edytor lub biblioteka.
            BFS/DFS, najkrótsze ścieżki i MST to osobne kategorie problemów.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/results" className="btn btn-outline"><BarChart3 size={15} /> Analiza wyników</Link>
          <span className="version-pill">Moduł badawczy</span>
        </div>
      </div>

      <div className="bench-grid">
        <section className="panel bench-controls">
          <div className="panel-header"><h3><Network size={18} /> Konfiguracja</h3></div>
          <div className="bench-form">
            <label htmlFor="bench-source">Źródło grafu</label>
            <select
              id="bench-source"
              value={graphSource}
              disabled={busy}
              onChange={e => setGraphSource(e.target.value as GraphSource)}
            >
              <option value="generator">Generator dużych grafów</option>
              <option value="editor">Bieżący edytor (workspace)</option>
              <option value="library">Biblioteka zapisanych grafów</option>
            </select>

            {graphSource === 'library' && (
              <>
                <label htmlFor="bench-lib">Graf z biblioteki</label>
                <select
                  id="bench-lib"
                  value={libraryId}
                  disabled={busy}
                  onChange={e => setLibraryId(e.target.value)}
                >
                  <option value="">— wybierz —</option>
                  {libraryEntries.map(entry => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ({entry.graph.nodes.length} V / {entry.graph.edges.length} E)
                    </option>
                  ))}
                </select>
                <GraphLibraryPanel compact currentGraph={null} title="Szybki dostęp do biblioteki" />
              </>
            )}

            {graphSource === 'editor' && (
              <p className="bench-hint">
                Używany jest aktualny zapis workspace edytora (localStorage). Zapisz graf w edytorze przed pomiarem.
                Limit bezpieczeństwa: {MAX_VERTICES.toLocaleString('pl-PL')} V / {MAX_EDGES.toLocaleString('pl-PL')} E.
              </p>
            )}

            {graphSource === 'generator' && (
              <>
                <label htmlFor="bench-topo">Topologia grafu</label>
                <select
                  id="bench-topo"
                  value={topology}
                  disabled={busy}
                  onChange={e => setTopology(e.target.value as GraphTopology)}
                >
                  {topologies.map(id => <option key={id} value={id}>{topologyLabels[id]}</option>)}
                </select>

                <label htmlFor="bench-n">Liczba wierzchołków: <b>{vertices.toLocaleString('pl-PL')}</b></label>
                <select
                  id="bench-n"
                  value={vertices}
                  disabled={busy || topology === 'complete'}
                  onChange={e => setVertices(Number(e.target.value))}
                >
                  {(topology === 'complete' ? graphSizes.filter(n => n <= 400) : graphSizes).map(n => (
                    <option key={n} value={n}>{n.toLocaleString('pl-PL')} wierzchołków</option>
                  ))}
                </select>

                {topology === 'erdos' && (
                  <>
                    <label>Sposób zadawania krawędzi</label>
                    <select
                      value={edgeCountMode}
                      disabled={busy}
                      onChange={e => setEdgeCountMode(e.target.value as 'density' | 'exact')}
                    >
                      <option value="density">Gęstość (%)</option>
                      <option value="exact">Dokładna liczba krawędzi</option>
                    </select>
                    {edgeCountMode === 'density' ? (
                      <>
                        <label htmlFor="bench-d">Docelowa gęstość: <b>{density}%</b></label>
                        <input
                          id="bench-d"
                          type="range"
                          min={1}
                          max={30}
                          step={1}
                          value={density}
                          disabled={busy}
                          onChange={e => setDensity(Number(e.target.value))}
                        />
                      </>
                    ) : (
                      <>
                        <label htmlFor="bench-e">Liczba krawędzi</label>
                        <input
                          className="bench-number"
                          id="bench-e"
                          type="number"
                          min={vertices - 1}
                          max={MAX_EDGES}
                          value={exactEdges}
                          disabled={busy}
                          onChange={e => setExactEdges(Number(e.target.value))}
                        />
                      </>
                    )}
                  </>
                )}

                <div className="bench-inline-2">
                  <label>
                    Waga min
                    <input
                      className="bench-number"
                      type="number"
                      value={weightMin}
                      disabled={busy}
                      onChange={e => setWeightMin(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Waga max
                    <input
                      className="bench-number"
                      type="number"
                      value={weightMax}
                      disabled={busy}
                      onChange={e => setWeightMax(Number(e.target.value))}
                    />
                  </label>
                </div>

                <label className="bench-check">
                  <input type="checkbox" checked={directed} disabled={busy} onChange={e => setDirected(e.target.checked)} />
                  <span>Graf skierowany</span>
                </label>

                <label htmlFor="bench-seed">Ziarno (seed)</label>
                <input
                  className="bench-number"
                  id="bench-seed"
                  type="number"
                  step={1}
                  value={seed}
                  disabled={busy}
                  onChange={e => setSeed(Number(e.target.value))}
                />

                <p className="bench-hint">
                  Przewidywane krawędzie: <b>{expectedEdges.toLocaleString('pl-PL')}</b>.
                  To samo ziarno ⇒ identyczny graf dla wszystkich algorytmów w sesji.
                </p>
              </>
            )}

            <label htmlFor="bench-r">Liczba powtórzeń</label>
            <select
              id="bench-r"
              value={repetitions}
              disabled={busy}
              onChange={e => setRepetitions(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>

            {!validation.ok && 'message' in validation && (
              <p className="bench-warning" role="alert">{validation.message}</p>
            )}
            {weightMin < 0 && graphSource === 'generator' && (
              <p className="bench-warning">
                Wagi ujemne: Dijkstra zostanie pominięta. Na grafie nieskierowanym Bellman–Ford może wykryć ujemny cykl 2-krawędziowy.
              </p>
            )}
            {directed && (
              <p className="bench-hint">Prim/Kruskal wymagają grafu nieskierowanego — zostaną pominięte z wyjaśnieniem.</p>
            )}

            <div className="bench-subtitle">WYBÓR ALGORYTMÓW</div>
            <label htmlFor="bench-mode">Tryb</label>
            <select
              id="bench-mode"
              value={mode}
              disabled={busy}
              onChange={e => setMode(e.target.value as SelectMode)}
            >
              <option value="all">Wszystkie zgodne (6 algorytmów)</option>
              <option value="pair">Para (dokładnie 2)</option>
              <option value="multi">Własny zestaw (checkboksy)</option>
            </select>

            {mode === 'pair' ? (
              <>
                <div className="bench-inline-2">
                  <label>
                    Algorytm A
                    <select value={pairA} disabled={busy} onChange={e => setPairA(e.target.value as AlgorithmId)}>
                      {ALL_BENCHMARK_ALGORITHMS.map(id => <option key={id} value={id}>{algorithmLabels[id]}</option>)}
                    </select>
                  </label>
                  <label>
                    Algorytm B
                    <select value={pairB} disabled={busy} onChange={e => setPairB(e.target.value as AlgorithmId)}>
                      {ALL_BENCHMARK_ALGORITHMS.map(id => <option key={id} value={id}>{algorithmLabels[id]}</option>)}
                    </select>
                  </label>
                </div>
                {pairMethodNotes.map(note => (
                  <p className="bench-warning" key={note.slice(0, 40)}>{note}</p>
                ))}
              </>
            ) : mode === 'multi' ? (
              ALL_BENCHMARK_ALGORITHMS.map(id => (
                <div key={id} className="bench-algo-block">
                  <label className="bench-check">
                    <input
                      type="checkbox"
                      checked={multiSelected.includes(id)}
                      disabled={busy}
                      onChange={() => toggle(id)}
                    />
                    <span>{algorithmLabels[id]} · {PROBLEM_GROUP_LABELS[ALGORITHM_PROBLEM_GROUP[id]]}</span>
                  </label>
                  <p className="bench-algo-hint">{BENCHMARK_TASK_HINTS[id]}</p>
                </div>
              ))
            ) : (
              <p className="bench-hint">
                Uruchomione zostaną wszystkie algorytmy zgodne z grafem; pozostałe dostaną status „pominięto” z powodem.
              </p>
            )}

            <div className="bench-subtitle">STATUS PRZED STARTEM</div>
            <div className="bench-preflight">
              {preflight.length === 0 ? (
                <p className="bench-hint">Uzupełnij źródło grafu, aby zobaczyć statusy.</p>
              ) : preflight.map(row => (
                <div
                  key={row.id}
                  className={`bench-preflight-row ${row.eligibility.ok ? 'is-ready' : 'is-skip'}`}
                >
                  <strong>{algorithmLabels[row.id]}</strong>
                  <span>
                    {row.eligibility.ok
                      ? `gotowy · ${PROBLEM_GROUP_LABELS[row.eligibility.group]}`
                      : `pominięty — ${row.eligibility.reason}`}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary bench-run"
              disabled={busy || !validation.ok || readyCount === 0 || (mode === 'pair' && pairA === pairB)}
              onClick={run}
            >
              <Play size={16} />{busy ? 'Trwa pomiar...' : 'Uruchom eksperyment'}
            </button>
            {busy && (
              <button className="btn btn-outline bench-run" onClick={cancel}>
                Anuluj obliczenia
              </button>
            )}

            <div className="bench-progress" aria-hidden={!busy && progress === 0}>
              <div className="bench-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="bench-status" role="status">{status}</div>
            <p className="bench-hint">{storageNote}</p>
          </div>
        </section>

        <section className="panel bench-output">
          <div className="panel-header">
            <h3><Activity size={18} /> Ostatnie wyniki</h3>
            <span className="section-chip">Czas algorytmu w ms</span>
          </div>
          {results.length === 0 ? (
            <div className="bench-empty">
              <BarChart3 size={40} />
              <h3>Brak wyników</h3>
              <p>Skonfiguruj graf i uruchom eksperyment. Możesz zacząć od 100 wierzchołków lub grafu z biblioteki.</p>
            </div>
          ) : (
            <div className="bench-result-list">
              {results.slice(0, 6).map(r => (
                <div className="bench-result" key={r.id}>
                  <div>
                    <strong>{algorithmLabels[r.algorithm]}</strong>
                    <small>
                      {statusLabel(r)} · {r.vertices} V · {r.edges} E
                      {r.sourceLabel ? ` · ${r.sourceLabel}` : ''}
                      {r.skipReason ? ` · ${r.skipReason}` : ''}
                    </small>
                  </div>
                  <div className="bench-time">
                    {(r.status ?? 'ran') === 'ran' ? <>{fmt(r.mean)} <span>ms śr.</span></> : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bench-note">
            <b>Co mierzymy:</b> lean BFS/DFS/Dijkstra/Bellman–Ford/Prim/Kruskal z <code>src/utils/benchmark.ts</code>
            (osobny wątek, bez budowy kroków wizualizacji). Wizualizacja używa instrumentowanych wersji z
            <code> graphAlgorithms.ts</code> / <code>mstAlgorithms.ts</code> — ich czasów nie porównuj z tymi wynikami.
            <br />
            {OPERATIONS_HINT}
            <br />
            {COMPLEXITY_COMPARISON_NOTE}
          </div>
          {runIds.length > 0 && (
            <div className="bench-runids">
              <small>Ponownie otwórz sesję:</small>
              {runIds.map(id => (
                <button key={id} type="button" className="btn btn-outline" onClick={() => openBatch(id)}>
                  {id.slice(0, 12)}…
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {lastBatch && (
        <section className="panel bench-pair">
          <div className="panel-header">
            <h3>Zestawienie sesji (wszystkie wybrane algorytmy)</h3>
            <span className="section-chip">
              {lastBatch[0]?.vertices ?? 0} V · {lastBatch[0]?.edges ?? 0} E
              {lastBatch[0]?.sourceLabel ? ` · ${lastBatch[0].sourceLabel}` : ''}
            </span>
          </div>
          <div className="bench-pair-body">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Algorytm</th>
                    <th>Kategoria</th>
                    <th>Status</th>
                    <th>Powód</th>
                    <th>Śr.</th>
                    <th>Mediana</th>
                    <th>Min/Max</th>
                    <th>σ</th>
                    <th>Operacje</th>
                    <th>Złożoność</th>
                  </tr>
                </thead>
                <tbody>
                  {lastBatch.map(row => (
                    <tr key={row.id} className={(row.status ?? 'ran') !== 'ran' ? 'is-muted' : undefined}>
                      <td>{algorithmLabels[row.algorithm]}</td>
                      <td>{PROBLEM_GROUP_LABELS[ALGORITHM_PROBLEM_GROUP[row.algorithm]]}</td>
                      <td>{statusLabel(row)}</td>
                      <td>{row.skipReason ?? '—'}</td>
                      <td>{(row.status ?? 'ran') === 'ran' ? fmt(row.mean) : '—'}</td>
                      <td>{(row.status ?? 'ran') === 'ran' ? fmt(row.median) : '—'}</td>
                      <td>{(row.status ?? 'ran') === 'ran' ? `${fmt(row.min)} / ${fmt(row.max)}` : '—'}</td>
                      <td>{(row.status ?? 'ran') === 'ran' ? fmt(row.stdDev) : '—'}</td>
                      <td>{(row.status ?? 'ran') === 'ran' ? row.operations.toLocaleString('pl-PL') : '—'}</td>
                      <td><code>{complexityLabel(row.algorithm)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {chartRows.length > 0 && (
              <div className="bench-pair-chart" aria-label="Porównanie średnich czasów (tylko wykonane)">
                {chartRows.map(row => {
                  const width = Math.max(4, (row.mean / maxMean) * 100)
                  return (
                    <div className="bench-pair-bar-row" key={row.id}>
                      <span>{algorithmLabels[row.algorithm]}</span>
                      <div className="bench-pair-bar-track">
                        <div className="bench-pair-bar-fill" style={{ width: `${width}%` }} />
                      </div>
                      <strong>{fmt(row.mean)} ms</strong>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="bench-insights">
              <h4>Interpretacja według kategorii problemu</h4>
              {groupInsights.map(group => (
                <div key={group.group} className="bench-group-insight">
                  <strong>{group.label}</strong>
                  <p>{group.summary}</p>
                  {group.skipped.map(s => (
                    <p className="bench-warning" key={s.id}>
                      {algorithmLabels[s.algorithm]}: {s.skipReason}
                    </p>
                  ))}
                </div>
              ))}
              <p className="bench-hint">
                Nie porównujemy automatycznie BFS z Dijkstrą ani MST z najkrótszą ścieżką jako „tego samego zadania”.
              </p>
            </div>
          </div>
        </section>
      )}

      {lastPair && (
        <section className="panel bench-pair">
          <div className="panel-header">
            <h3>Dodatkowe zestawienie pary</h3>
          </div>
          <div className="bench-pair-body">
            <div className="bench-insights">
              <h4>Wnioski z porównania pary</h4>
              {lastPair.warnings.map(w => <p className="bench-warning" key={w.slice(0, 48)}>{w}</p>)}
              <ul>
                {lastPair.conclusions.map(c => <li key={c.slice(0, 64)}>{c}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="panel bench-history">
        <div className="panel-header">
          <h3><BarChart3 size={18} /> Historia eksperymentów ({results.length})</h3>
          <div className="bench-actions">
            <button className="btn btn-outline" disabled={!results.length || busy} onClick={() => exportCSV(results)}>
              <Download size={15} /> CSV
            </button>
            <button className="btn btn-outline" disabled={!results.length || busy} onClick={clear}>
              <Trash2 size={15} /> Wyczyść
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Algorytm</th>
                <th>Status</th>
                <th>Źródło</th>
                <th>V</th>
                <th>E</th>
                <th>Śr. (ms)</th>
                <th>σ</th>
                <th>Operacje</th>
                <th>Powód</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={9} className="bench-no-data">Brak zapisanych pomiarów.</td></tr>
              ) : results.map(r => (
                <tr key={r.id}>
                  <td>{algorithmLabels[r.algorithm]}</td>
                  <td>{statusLabel(r)}</td>
                  <td>{r.sourceLabel ?? topologyLabels[r.topology]}</td>
                  <td>{r.vertices}</td>
                  <td>{r.edges}</td>
                  <td>{(r.status ?? 'ran') === 'ran' ? fmt(r.mean) : '—'}</td>
                  <td>{(r.status ?? 'ran') === 'ran' ? fmt(r.stdDev) : '—'}</td>
                  <td>{(r.status ?? 'ran') === 'ran' ? r.operations.toLocaleString('pl-PL') : '—'}</td>
                  <td>{r.skipReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
