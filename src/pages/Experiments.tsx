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
  type AlgorithmId,
  type BenchResult,
} from '../utils/benchmark'
import { COMPLEXITY_COMPARISON_NOTE } from '../utils/complexityCatalog'
import {
  algorithmLimit,
  estimateEdgeCount,
  graphSizes,
  MAX_EDGES,
  MAX_VERTICES,
  topologyLabels,
  validateGeneratorParams,
  type GraphTopology,
} from '../utils/largeGraphs'
import { saveExperimentsBestEffort } from '../services/graphApi'
import type { BenchmarkRequest } from '../utils/benchmark'
import './Experiments.css'

const ids: AlgorithmId[] = ['bfs', 'dfs', 'dijkstra', 'bellman']
const topologies: GraphTopology[] = ['erdos', 'complete', 'grid', 'tree', 'path', 'cycle']
const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export default function Experiments() {
  const location = useLocation()
  const scenarioSizes = new URLSearchParams(location.search).get('scenario') === 'sizes'
  const [topology, setTopology] = useState<GraphTopology>(scenarioSizes ? 'path' : 'erdos')
  const [vertices, setVertices] = useState(100)
  const [seed, setSeed] = useState(12345)
  const [density, setDensity] = useState(10)
  const [edgeCountMode, setEdgeCountMode] = useState<'density' | 'exact'>('density')
  const [exactEdges, setExactEdges] = useState(200)
  const [weightMin, setWeightMin] = useState(1)
  const [weightMax, setWeightMax] = useState(20)
  const [directed, setDirected] = useState(false)
  const [repetitions, setRepetitions] = useState(scenarioSizes ? 5 : 10)
  const [selected, setSelected] = useState<AlgorithmId[]>(['bfs', 'dfs', 'dijkstra'])
  const [results, setResults] = useState<BenchResult[]>(loadResults)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(
    scenarioSizes
      ? 'Scenariusz F: uruchom pomiary dla 100, potem 1000, potem 10 000 wierzchołków (topologia „ścieżka” jest już ustawiona). Każdy rozmiar to osobny, realny pomiar — bez fikcyjnych wyników.'
      : '',
  )
  const [progress, setProgress] = useState(0)
  const [storageNote, setStorageNote] = useState(
    'Wyniki trafiają do localStorage (klucz graphlab-benchmarks-v2). SQLite jest używany, gdy API na :3001 działa.',
  )
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  const params = useMemo(() => ({
    topology,
    vertices,
    densityPercent: density,
    edgeCount: edgeCountMode === 'exact' && topology === 'erdos' ? exactEdges : undefined,
    seed,
    weightMin,
    weightMax,
    directed,
  }), [topology, vertices, density, edgeCountMode, exactEdges, seed, weightMin, weightMax, directed])

  const expectedEdges = estimateEdgeCount(params)
  const validation = validateGeneratorParams(params)
  const limitation = selected
    .map(id => algorithmLimit(id, vertices, expectedEdges))
    .find(Boolean)

  const toggle = (id: AlgorithmId) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const cancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setBusy(false)
    setProgress(0)
    setStatus('Anulowano obliczenia. Częściowe wyniki z tej sesji nie zostały zapisane.')
  }

  const run = () => {
    if (!selected.length) {
      setStatus('Wybierz przynajmniej jeden algorytm.')
      return
    }
    if (!validation.ok) {
      setStatus(validation.message)
      return
    }
    if (limitation) {
      setStatus(limitation)
      return
    }

    setBusy(true)
    setProgress(2)
    setStatus('Uruchamianie Web Workera...')
    const worker = new Worker(new URL('../workers/benchmark.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<{
      type: string
      message?: string
      percent?: number
      results?: BenchResult[]
      edges?: number
      generateMs?: number
    }>) => {
      const message = event.data
      if (message.type === 'progress') {
        setStatus(message.message || 'Trwa obliczanie...')
        if (typeof message.percent === 'number') setProgress(message.percent)
        return
      }
      if (message.type === 'complete') {
        const next = message.results || []
        setResults(previous => {
          const all = [...next, ...previous].slice(0, 200)
          saveResults(all)
          return all
        })
        void saveExperimentsBestEffort(next.map(r => ({
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

        setProgress(100)
        setStatus(
          `Zakończono ${next.length} pomiar(ów) na ${message.edges} krawędziach. ` +
            `Czas generowania grafu: ${fmt(message.generateMs ?? 0)} ms (nie wchodzi w czas algorytmu).`,
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

    const request: BenchmarkRequest = {
      ...params,
      repetitions,
      selected,
    }
    worker.postMessage(request)
  }

  const clear = () => {
    if (!window.confirm('Usunąć historię pomiarów z przeglądarki?')) return
    setResults([])
    saveResults([])
    setStatus('Historia lokalna usunięta.')
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><FlaskConical size={14} /> PERFORMANCE LAB</div>
          <h1>Eksperymenty wydajnościowe</h1>
          <p>
            Generuj duże grafy i mierz czas lean-implementacji w Web Workerze — bez animacji i bez React Flow.
            BFS/DFS: pełne przeszukiwanie osiągalnej części; Dijkstra/Bellman–Ford: najkrótsze ścieżki od źródła
            (to inne problemy — nie traktuj ich czasów jako równoważnych). Czas generowania grafu jest osobny.
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
              {(topology === 'complete'
                ? graphSizes.filter(n => n <= 400)
                : graphSizes
              ).map(n => (
                <option key={n} value={n}>{n.toLocaleString('pl-PL')} wierzchołków</option>
              ))}
            </select>
            {topology === 'complete' && (
              <input
                className="bench-number"
                type="number"
                min={2}
                max={450}
                value={vertices}
                disabled={busy}
                onChange={e => setVertices(Math.min(450, Math.max(2, Number(e.target.value) || 2)))}
                aria-label="Dokładna liczba wierzchołków grafu pełnego"
              />
            )}

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
                  min={0}
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
                  min={0}
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
              Limit bezpieczeństwa: {MAX_VERTICES.toLocaleString('pl-PL')} V / {MAX_EDGES.toLocaleString('pl-PL')} E.
              To samo ziarno + te same parametry ⇒ identyczny graf dla wszystkich wybranych algorytmów.
              Czas generowania jest mierzony osobno i nie wchodzi w czas algorytmu.
            </p>

            {!validation.ok && <p className="bench-warning" role="alert">{validation.message}</p>}
            {limitation && (
              <p className="bench-warning" role="alert">
                {limitation} Odznacz algorytm albo zmniejsz graf.
              </p>
            )}

            <div className="bench-subtitle">ALGORYTMY (zadanie pomiarowe)</div>
            {ids.map(id => (
              <div key={id} className="bench-algo-block">
                <label className="bench-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    disabled={busy}
                    onChange={() => toggle(id)}
                  />
                  <span>{algorithmLabels[id]}</span>
                </label>
                <p className="bench-algo-hint">{BENCHMARK_TASK_HINTS[id]}</p>
              </div>
            ))}

            <button
              className="btn btn-primary bench-run"
              disabled={busy || !validation.ok || !!limitation}
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
            <div className="bench-status" role="status">{status || 'Gotowe do uruchomienia pomiarów.'}</div>
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
              <p>Skonfiguruj graf i uruchom pierwszy eksperyment. Możesz zacząć od 100 wierzchołków.</p>
            </div>
          ) : (
            <div className="bench-result-list">
              {results.slice(0, 5).map(r => (
                <div className="bench-result" key={r.id}>
                  <div>
                    <strong>{algorithmLabels[r.algorithm]}</strong>
                    <small>
                      {r.vertices} V · {r.edges} E · {topologyLabels[r.topology]} · {r.repetitions} powt.
                      {r.generateMs > 0 ? ` · gen. ${fmt(r.generateMs)} ms` : ''}
                    </small>
                  </div>
                  <div className="bench-time">{fmt(r.mean)} <span>ms śr.</span></div>
                </div>
              ))}
            </div>
          )}
          <div className="bench-note">
            <b>Co mierzymy:</b> implementacje bez animacji (operacje benchmarku ≠ kroki wizualizacji).
            Odchylenie σ to pierwiastek ze średniej kwadratów odchyleń od średniej (wariancja populacyjna, dzielnik = liczba powtórzeń).
            <br />
            <b>Wartość edukacyjna:</b> Big O opisuje tempo wzrostu kosztu względem V i E, a nie dokładne milisekundy.
            {COMPLEXITY_COMPARISON_NOTE} Przed serią wykonywana jest rozgrzewka (warm-up).
          </div>
        </section>
      </div>

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
                <th>Topologia</th>
                <th>V</th>
                <th>E</th>
                <th>Gęstość</th>
                <th>Śr. (ms)</th>
                <th>Mediana</th>
                <th>σ</th>
                <th>Min</th>
                <th>Max</th>
                <th>Gen. (ms)</th>
                <th>Operacje</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={12} className="bench-no-data">Brak zapisanych pomiarów.</td></tr>
              ) : results.map(r => (
                <tr key={r.id}>
                  <td>{algorithmLabels[r.algorithm]}</td>
                  <td>{topologyLabels[r.topology]}</td>
                  <td>{r.vertices}</td>
                  <td>{r.edges}</td>
                  <td>{r.density}%</td>
                  <td>{fmt(r.mean)}</td>
                  <td>{fmt(r.median)}</td>
                  <td>{fmt(r.stdDev)}</td>
                  <td>{fmt(r.min)}</td>
                  <td>{fmt(r.max)}</td>
                  <td>{fmt(r.generateMs)}</td>
                  <td>{r.operations.toLocaleString('pl-PL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
