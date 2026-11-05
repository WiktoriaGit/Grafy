import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Download,
  FlaskConical,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  algorithmLabels,
  exportCSV,
  loadResults,
  saveResults,
  type AlgorithmId,
  type BenchResult,
} from '../utils/benchmark'
import { topologyLabels } from '../utils/largeGraphs'
import './Results.css'

const algorithms: AlgorithmId[] = ['bfs', 'dfs', 'dijkstra', 'bellman']
const colors: Record<AlgorithmId, string> = {
  bfs: '#a5b4fc',
  dfs: '#34d399',
  dijkstra: '#38bdf8',
  bellman: '#fbbf24',
}
const format = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const valid = (r: BenchResult) =>
  Number.isFinite(r.mean) && Number.isFinite(r.min) && Number.isFinite(r.max) && Number.isFinite(r.vertices)

export default function Results() {
  const [results, setResults] = useState<BenchResult[]>(() => loadResults().filter(valid))
  const [selected, setSelected] = useState<AlgorithmId | 'all'>('all')
  const [metric, setMetric] = useState<'mean' | 'median' | 'min' | 'max'>('mean')
  const [density, setDensity] = useState<string>('all')
  const [repetitions, setRepetitions] = useState<string>('all')
  const refresh = () => setResults(loadResults().filter(valid))

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'graphlab-benchmarks-v2' || e.key === 'graphlab-benchmarks-v1') refresh()
    }
    const onFocus = () => refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const densities = useMemo(
    () => [...new Set(results.map(r => String(r.density)))].sort((a, b) => Number(a) - Number(b)),
    [results],
  )
  const repetitionOptions = useMemo(
    () => [...new Set(results.map(r => String(r.repetitions)))].sort((a, b) => Number(a) - Number(b)),
    [results],
  )

  const filtered = useMemo(() => results.filter(r =>
    (selected === 'all' || r.algorithm === selected)
    && (density === 'all' || String(r.density) === density)
    && (repetitions === 'all' || String(r.repetitions) === repetitions),
  ), [results, selected, density, repetitions])

  const chartByVertices = useMemo(() => {
    const groups = new Map<number, Partial<Record<AlgorithmId, { total: number; count: number }>>>()
    for (const r of filtered) {
      const group = groups.get(r.vertices) ?? {}
      const previous = group[r.algorithm] ?? { total: 0, count: 0 }
      group[r.algorithm] = { total: previous.total + r[metric], count: previous.count + 1 }
      groups.set(r.vertices, group)
    }
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([vertices, group]) => {
      const row: Record<string, number> = { vertices }
      for (const id of algorithms) {
        if (group[id]) row[id] = group[id]!.total / group[id]!.count
      }
      return row
    })
  }, [filtered, metric])

  const chartByEdges = useMemo(() => {
    const groups = new Map<number, Partial<Record<AlgorithmId, { total: number; count: number }>>>()
    for (const r of filtered) {
      const group = groups.get(r.edges) ?? {}
      const previous = group[r.algorithm] ?? { total: 0, count: 0 }
      group[r.algorithm] = { total: previous.total + r[metric], count: previous.count + 1 }
      groups.set(r.edges, group)
    }
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([edges, group]) => {
      const row: Record<string, number> = { edges }
      for (const id of algorithms) {
        if (group[id]) row[id] = group[id]!.total / group[id]!.count
      }
      return row
    })
  }, [filtered, metric])

  const chartMeansByAlgorithm = useMemo(() => {
    const groups = new Map<AlgorithmId, { total: number; count: number }>()
    for (const r of filtered) {
      const previous = groups.get(r.algorithm) ?? { total: 0, count: 0 }
      groups.set(r.algorithm, { total: previous.total + r.mean, count: previous.count + 1 })
    }
    return algorithms
      .filter(id => groups.has(id))
      .map(id => ({
        algorithm: algorithmLabels[id],
        mean: groups.get(id)!.total / groups.get(id)!.count,
        fill: colors[id],
      }))
  }, [filtered])

  const average = filtered.length ? filtered.reduce((sum, r) => sum + r.mean, 0) / filtered.length : 0
  const distinctAlgorithms = new Set(filtered.map(r => r.algorithm)).size

  const removeAll = () => {
    if (!window.confirm('Usunąć wszystkie zapisane pomiary z przeglądarki?')) return
    saveResults([])
    setResults([])
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><BarChart3 size={14} /> DATA ANALYTICS</div>
          <h1>Wyniki i analiza</h1>
          <p>
            Rzeczywiste pomiary z modułu eksperymentów. Dane lokalne: <code>localStorage / graphlab-benchmarks-v2</code>.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/experiments" className="btn btn-outline"><FlaskConical size={15} /> Eksperymenty</Link>
          <button className="btn btn-outline" onClick={refresh}><RefreshCw size={16} /> Odśwież dane</button>
        </div>
      </div>

      <div className="results-summary">
        <div className="stat-card"><div className="results-stat-label">Zapisane pomiary</div><div className="stat-value">{filtered.length}</div></div>
        <div className="stat-card"><div className="results-stat-label">Badane algorytmy</div><div className="stat-value">{distinctAlgorithms}</div></div>
        <div className="stat-card"><div className="results-stat-label">Średni czas pomiarów</div><div className="stat-value">{format(average)} <small>ms</small></div></div>
      </div>

      <section className="panel results-edu">
        <div className="panel-header"><h3>Jak czytać wyniki?</h3></div>
        <div className="results-edu-body">
          <p><b>Złożoność czasowa</b> opisuje, jak koszt algorytmu rośnie wraz z rozmiarem wejścia (V, E) w notacji asymptotycznej — to model teoretyczny, nie wynik z zegara.</p>
          <p><b>Czas zmierzony</b> (`performance.now`) obejmuje realną implementację w JS, JIT, cache i obciążenie systemu. Dlatego ten sam algorytm może dać różne czasy między uruchomieniami.</p>
          <p><b>Małe czasy</b> (&lt;1 ms) są szczególnie niestabilne — nie ogłaszaj zwycięzcy na podstawie jednego krótkiego pomiaru; zwiększ V/E lub liczbę powtórzeń.</p>
          <p><b>Czas generowania grafu</b> jest zapisywany osobno i nie jest wliczany do średniej/mediany algorytmu. Wykresy poniżej używają wyłącznie rzeczywistych pomiarów z historii.</p>
        </div>
      </section>

      <section className="panel results-filter-panel">
        <div className="panel-header"><h3><Activity size={18} /> Filtry i sposób prezentacji</h3></div>
        <div className="results-filters">
          <label>
            Algorytm
            <select value={selected} onChange={e => setSelected(e.target.value as AlgorithmId | 'all')}>
              <option value="all">Wszystkie algorytmy</option>
              {algorithms.map(id => <option key={id} value={id}>{algorithmLabels[id]}</option>)}
            </select>
          </label>
          <label>
            Gęstość grafu
            <select value={density} onChange={e => setDensity(e.target.value)}>
              <option value="all">Wszystkie gęstości</option>
              {densities.map(d => <option key={d} value={d}>{d}%</option>)}
            </select>
          </label>
          <label>
            Liczba powtórzeń
            <select value={repetitions} onChange={e => setRepetitions(e.target.value)}>
              <option value="all">Wszystkie</option>
              {repetitionOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Miara czasu
            <select value={metric} onChange={e => setMetric(e.target.value as typeof metric)}>
              <option value="mean">Średni czas</option>
              <option value="median">Mediana</option>
              <option value="min">Minimalny czas</option>
              <option value="max">Maksymalny czas</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel results-chart-panel">
        <div className="panel-header">
          <h3><BarChart3 size={18} /> Porównanie średnich czasów algorytmów</h3>
          <span className="section-chip">ms</span>
        </div>
        {chartMeansByAlgorithm.length ? (
          <div className="results-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartMeansByAlgorithm} margin={{ top: 15, right: 25, left: 10, bottom: 12 }}>
                <CartesianGrid stroke="#29364a" strokeDasharray="3 5" />
                <XAxis dataKey="algorithm" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={n => Number(n).toFixed(2)} />
                <Tooltip
                  contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 10, color: '#fff' }}
                  formatter={(value) => [typeof value === 'number' ? `${format(value)} ms` : value, 'Średnia']}
                />
                <Bar dataKey="mean" name="Średni czas" fill="#818cf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="results-empty">Brak wyników. Uruchom pomiary w zakładce „Eksperymenty”.</div>
        )}
      </section>

      <section className="panel results-chart-panel">
        <div className="panel-header">
          <h3><BarChart3 size={18} /> Czas wykonania a liczba wierzchołków</h3>
          <span className="section-chip">ms</span>
        </div>
        {chartByVertices.length ? (
          <div className="results-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartByVertices} margin={{ top: 15, right: 25, left: 10, bottom: 12 }}>
                <CartesianGrid stroke="#29364a" strokeDasharray="3 5" />
                <XAxis
                  dataKey="vertices"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Liczba wierzchołków (V)', position: 'insideBottom', offset: -6, fill: '#94a3b8' }}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={n => Number(n).toFixed(2)} />
                <Tooltip
                  contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 10, color: '#fff' }}
                  formatter={(value, name) => [typeof value === 'number' ? `${format(value)} ms` : value, String(name)]}
                />
                <Legend verticalAlign="top" height={36} />
                {algorithms.filter(id => selected === 'all' || selected === id).map(id => (
                  <Line
                    key={id}
                    type="linear"
                    dataKey={id}
                    name={algorithmLabels[id]}
                    stroke={colors[id]}
                    strokeWidth={2.5}
                    connectNulls={false}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="results-empty">Brak punktów dla wykresu V.</div>
        )}
        <p className="results-note">
          Punkty o tej samej liczbie wierzchołków i algorytmie są uśredniane z zapisanej historii.
          Porównuj serie o zbliżonej gęstości / topologii i liczbie powtórzeń.
        </p>
      </section>

      <section className="panel results-chart-panel">
        <div className="panel-header">
          <h3><BarChart3 size={18} /> Czas wykonania a liczba krawędzi</h3>
          <span className="section-chip">ms</span>
        </div>
        {chartByEdges.length ? (
          <div className="results-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartByEdges} margin={{ top: 15, right: 25, left: 10, bottom: 12 }}>
                <CartesianGrid stroke="#29364a" strokeDasharray="3 5" />
                <XAxis
                  dataKey="edges"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Liczba krawędzi (E)', position: 'insideBottom', offset: -6, fill: '#94a3b8' }}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={n => Number(n).toFixed(2)} />
                <Tooltip
                  contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 10, color: '#fff' }}
                  formatter={(value, name) => [typeof value === 'number' ? `${format(value)} ms` : value, String(name)]}
                />
                <Legend verticalAlign="top" height={36} />
                {algorithms.filter(id => selected === 'all' || selected === id).map(id => (
                  <Line
                    key={id}
                    type="linear"
                    dataKey={id}
                    name={algorithmLabels[id]}
                    stroke={colors[id]}
                    strokeWidth={2.5}
                    connectNulls={false}
                    dot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="results-empty">Brak punktów dla wykresu E.</div>
        )}
      </section>

      <section className="panel results-history-panel">
        <div className="panel-header">
          <h3>Historia pomiarów ({filtered.length})</h3>
          <div className="results-actions">
            <button className="btn btn-outline" disabled={!filtered.length} onClick={() => exportCSV(filtered)}>
              <Download size={15} /> Eksport CSV
            </button>
            <button className="btn btn-outline" disabled={!results.length} onClick={removeAll}>
              <Trash2 size={15} /> Usuń historię
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Algorytm</th>
                <th>Topologia</th>
                <th>V</th>
                <th>E</th>
                <th>Gęstość</th>
                <th>Powt.</th>
                <th>Średnia</th>
                <th>Mediana</th>
                <th>σ</th>
                <th>Min</th>
                <th>Max</th>
                <th>Gen.</th>
                <th>Operacje</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.timestamp).toLocaleString('pl-PL')}</td>
                  <td>{algorithmLabels[r.algorithm]}</td>
                  <td>{topologyLabels[r.topology]}</td>
                  <td>{r.vertices}</td>
                  <td>{r.edges}</td>
                  <td>{r.density}%</td>
                  <td>{r.repetitions}</td>
                  <td>{format(r.mean)}</td>
                  <td>{format(r.median)}</td>
                  <td>{format(r.stdDev)}</td>
                  <td>{format(r.min)}</td>
                  <td>{format(r.max)}</td>
                  <td>{format(r.generateMs)}</td>
                  <td>{r.operations.toLocaleString('pl-PL')}</td>
                </tr>
              )) : (
                <tr><td colSpan={14} className="results-empty-row">Brak zapisanych wyników.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
