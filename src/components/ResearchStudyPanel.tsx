import { useMemo, useRef, useState } from 'react'
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
  Download,
  FlaskConical,
  Play,
  Save,
  Square,
  Trash2,
} from 'lucide-react'
import { algorithmLabels, type AlgorithmId, type BenchResult } from '../utils/benchmark'
import { PROBLEM_GROUP_LABELS, type AlgorithmProblemGroup } from '../utils/benchEligibility'
import {
  MAX_EDGES,
  MAX_VERTICES,
  RESEARCH_TOPOLOGIES,
  topologyLabels,
  type GraphTopology,
} from '../utils/largeGraphs'
import {
  ALGORITHM_PAIR_BY_GROUP,
  HYPOTHESIS_LABELS,
  STUDY_KIND_LABELS,
  buildInterpretation,
  buildResearchPlan,
  defaultResearchConfig,
  deleteResearchStudy,
  downloadTextFile,
  exportResearchCSV,
  exportResearchJSON,
  loadResearchStudies,
  suggestHypothesisVerdict,
  warnAboutCostlyCases,
  type HypothesisId,
  type HypothesisVerdict,
  type ResearchCaseResult,
  type ResearchConfig,
  type ResearchStudy,
  type StudyKind,
} from '../utils/researchStudy'
import { persistResearchStudyLocal } from '../services/persistence'
import {
  captureElementPngDataUrl,
  exportElementPng,
  exportResearchStudyPdf,
} from '../utils/experimentExport'
import {
  acceptNumberListDraft,
  acceptNumericDraft,
  formatNumberList,
  parseIntField,
  parseNumberList,
} from '../utils/numericInput'
import './ResearchStudyPanel.css'

type ResearchDrafts = {
  vertexSizes: string
  edgeSweep: string
  densitySweep: string
  vertices: string
  densityPercent: string
  repetitions: string
  seed: string
}

function draftsFromConfig(c: ResearchConfig): ResearchDrafts {
  return {
    vertexSizes: formatNumberList(c.vertexSizes),
    edgeSweep: formatNumberList(c.edgeSweep),
    densitySweep: formatNumberList(c.densitySweep),
    vertices: String(c.vertices),
    densityPercent: String(c.densityPercent),
    repetitions: String(c.repetitions),
    seed: String(c.seed),
  }
}

const colors: Record<AlgorithmId, string> = {
  bfs: '#A78BFA',
  dfs: '#34d399',
  dijkstra: '#38bdf8',
  bellman: '#fbbf24',
  prim: '#f472b6',
  kruskal: '#fb923c',
}

const fmt = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 3 })

const verdictLabel: Record<HypothesisVerdict, string> = {
  supported: 'wspierana przez wyniki',
  unsupported: 'niewspierana przez wyniki',
  inconclusive: 'nierozstrzygnięta',
  unset: 'nieoznaczona',
}

type Props = {
  onAppendBenchResults?: (rows: BenchResult[]) => void
}

export default function ResearchStudyPanel({ onAppendBenchResults }: Props) {
  const [config, setConfig] = useState<ResearchConfig>(defaultResearchConfig)
  const [drafts, setDrafts] = useState<ResearchDrafts>(() => draftsFromConfig(defaultResearchConfig()))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Skonfiguruj serię i uruchom badania porównawcze.')
  const [study, setStudy] = useState<ResearchStudy | null>(null)
  const [saved, setSaved] = useState<ResearchStudy[]>(() => loadResearchStudies())
  const [exportBusy, setExportBusy] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  // Zachowujemy funkcję CSV w kodzie (ukryta w UI).
  void exportResearchCSV

  const plan = useMemo(() => buildResearchPlan(config), [config])
  const warnings = useMemo(() => warnAboutCostlyCases(config, plan), [config, plan])
  const pair = ALGORITHM_PAIR_BY_GROUP[config.group]

  const chartByX = useMemo(() => {
    if (!study?.cases.length) return []
    return study.cases.map(c => {
      const row: Record<string, number | string> = {
        label: c.plan.label,
        x: study.config.studyKind === 'edges'
          ? c.actualEdges
          : study.config.studyKind === 'density'
            ? c.actualDensity
            : study.config.studyKind === 'structure'
              ? c.plan.index
              : c.actualVertices,
      }
      for (const r of c.results) {
        if ((r.status ?? 'ran') !== 'ran') continue
        row[r.algorithm] = Number(r.mean.toFixed(4))
        row[`${r.algorithm}_std`] = Number(r.stdDev.toFixed(4))
      }
      return row
    })
  }, [study])

  const patch = <K extends keyof ResearchConfig>(key: K, value: ResearchConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const patchDraft = <K extends keyof ResearchDrafts>(key: K, value: string) => {
    setDrafts(prev => ({ ...prev, [key]: value }))
  }

  const applyConfig = (next: ResearchConfig) => {
    setConfig(next)
    setDrafts(draftsFromConfig(next))
  }

  /** Zatwierdza drafty do config. Zwraca gotową konfigurację albo null + komunikat. */
  const commitDrafts = (): ResearchConfig | null => {
    const next: ResearchConfig = { ...config }

    if (config.studyKind === 'vertices') {
      const sizes = parseNumberList(drafts.vertexSizes, {
        label: 'Zakres V',
        min: 2,
        max: MAX_VERTICES,
        minCount: 1,
      })
      if (!sizes.ok) {
        setStatus(sizes.message)
        return null
      }
      next.vertexSizes = sizes.value

      const density = parseIntField(drafts.densityPercent, {
        label: 'Gęstość bazowa (%)',
        min: 1,
        max: 100,
      })
      if (!density.ok) {
        setStatus(density.message)
        return null
      }
      next.densityPercent = density.value
    }

    if (config.studyKind === 'edges' || config.studyKind === 'density' || config.studyKind === 'structure') {
      const vertices = parseIntField(drafts.vertices, {
        label: 'Liczba wierzchołków V',
        min: 2,
        max: MAX_VERTICES,
      })
      if (!vertices.ok) {
        setStatus(vertices.message)
        return null
      }
      next.vertices = vertices.value
    }

    if (config.studyKind === 'edges') {
      const edges = parseNumberList(drafts.edgeSweep, {
        label: 'Zakres E',
        min: 1,
        max: MAX_EDGES,
        minCount: 1,
      })
      if (!edges.ok) {
        setStatus(edges.message)
        return null
      }
      next.edgeSweep = edges.value
    }

    if (config.studyKind === 'density') {
      const dens = parseNumberList(drafts.densitySweep, {
        label: 'Zakres gęstości %',
        min: 1,
        max: 100,
        minCount: 1,
      })
      if (!dens.ok) {
        setStatus(dens.message)
        return null
      }
      next.densitySweep = dens.value
    }

    const repetitions = parseIntField(drafts.repetitions, {
      label: 'Powtórzenia',
      min: 1,
      max: 100,
    })
    if (!repetitions.ok) {
      setStatus(repetitions.message)
      return null
    }
    next.repetitions = repetitions.value

    const seed = parseIntField(drafts.seed, {
      label: 'Seed',
      min: 0,
      max: 2_147_483_647,
    })
    if (!seed.ok) {
      setStatus(seed.message)
      return null
    }
    next.seed = seed.value

    applyConfig(next)
    return next
  }

  const cancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setBusy(false)
    setProgress(0)
    setStatus('Anulowano serię badań. Częściowe wyniki tej serii nie zostały zapisane jako ukończone badanie.')
  }

  const run = () => {
    if (!config.name.trim()) {
      setStatus('Podaj nazwę serii badawczej.')
      return
    }
    const committed = commitDrafts()
    if (!committed) return

    const committedPlan = buildResearchPlan(committed)
    if (!committedPlan.length) {
      setStatus('Plan jest pusty — zmień parametry.')
      return
    }
    const executable = committedPlan.filter(p => !p.warning)
    if (!executable.length) {
      setStatus('Żaden przypadek nie jest wykonywalny przy obecnych limitach bezpieczeństwa.')
      return
    }
    const committedWarnings = warnAboutCostlyCases(committed, committedPlan)
    if (committedWarnings.length && !window.confirm(`${committedWarnings.join('\n\n')}\n\nKontynuować mimo ostrzeżeń?`)) {
      return
    }

    setBusy(true)
    setProgress(1)
    setStudy(null)
    setStatus('Uruchamianie serii w Web Workerze…')
    const worker = new Worker(new URL('../workers/research.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const studyId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    worker.onmessage = (event: MessageEvent<{
      type: string
      message?: string
      percent?: number
      studyId?: string
      name?: string
      config?: ResearchConfig
      plan?: typeof plan
      cases?: ResearchCaseResult[]
    }>) => {
      const message = event.data
      if (message.type === 'progress') {
        setStatus(message.message || 'Trwa seria…')
        if (typeof message.percent === 'number') setProgress(message.percent)
        return
      }
      if (message.type === 'complete' && message.config && message.plan && message.cases) {
        const draft: ResearchStudy = {
          id: message.studyId || studyId,
          name: message.name || committed.name,
          createdAt: new Date().toISOString(),
          config: message.config,
          plan: message.plan,
          cases: message.cases,
          interpretation: [],
          hypothesisVerdict: 'unset',
          hypothesisNote: '',
        }
        draft.interpretation = buildInterpretation(draft)
        const suggested = suggestHypothesisVerdict(draft)
        draft.hypothesisVerdict = suggested.verdict
        draft.hypothesisNote = suggested.note
        draft.updatedAt = new Date().toISOString()
        persistResearchStudyLocal(draft)
        setStudy(draft)
        const flat = draft.cases.flatMap(c => c.results)
        onAppendBenchResults?.(flat)
        setProgress(100)
        setStatus(`Zakończono serię „${draft.name}”: ${draft.cases.length} przypadków (zapis lokalny + sync SQLite).`)
      } else if (message.type === 'error') {
        setStatus(message.message || 'Błąd serii badań.')
        setProgress(0)
      }
      worker.terminate()
      workerRef.current = null
      setBusy(false)
    }

    worker.onerror = () => {
      setStatus('Błąd wątku serii badawczej.')
      worker.terminate()
      workerRef.current = null
      setBusy(false)
      setProgress(0)
    }

    worker.postMessage({
      studyId,
      name: committed.name.trim(),
      config: committed,
      plan: committedPlan,
    })
  }

  const persist = () => {
    if (!study) return
    persistResearchStudyLocal({
      ...study,
      updatedAt: new Date().toISOString(),
    })
    setSaved(loadResearchStudies())
    setStatus(`Zapisano serię „${study.name}” lokalnie; synchronizacja z SQLite w tle.`)
  }

  const loadSaved = (id: string) => {
    const found = saved.find(s => s.id === id)
    if (!found) return
    setStudy(found)
    applyConfig(found.config)
    setStatus(`Wczytano zapisane badanie „${found.name}”. Możesz je odtworzyć tymi samymi parametrami.`)
  }

  const removeSaved = (id: string) => {
    if (!window.confirm('Usunąć zapisane badanie?')) return
    deleteResearchStudy(id)
    setSaved(loadResearchStudies())
    if (study?.id === id) setStudy(null)
  }

  const setVerdict = (verdict: HypothesisVerdict) => {
    if (!study) return
    setStudy({
      ...study,
      hypothesisVerdict: verdict,
      hypothesisNote: study.hypothesisNote || `Ręcznie oznaczono jako: ${verdictLabel[verdict]}.`,
    })
  }

  const exportPng = async () => {
    if (!study || !chartRef.current) {
      setStatus('Brak wykresu do eksportu PNG — uruchom serię badań.')
      return
    }
    try {
      setExportBusy(true)
      setStatus('Eksport PNG w wysokiej rozdzielczości…')
      await exportElementPng(chartRef.current, `${study.name}-wykres.png`, { pixelRatio: 3 })
      setStatus(`Zapisano PNG wykresu dla „${study.name}” (pixelRatio=3).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się wyeksportować PNG.')
    } finally {
      setExportBusy(false)
    }
  }

  const exportPdf = async () => {
    if (!study) {
      setStatus('Brak ukończonego badania do raportu PDF.')
      return
    }
    try {
      setExportBusy(true)
      setStatus('Generowanie raportu PDF…')
      let chartDataUrl: string | null = null
      if (chartRef.current) {
        try {
          chartDataUrl = await captureElementPngDataUrl(chartRef.current, { pixelRatio: 2 })
        } catch {
          chartDataUrl = null
        }
      }
      await exportResearchStudyPdf(study, chartDataUrl)
      setStatus(`Zapisano raport PDF dla „${study.name}”.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się wygenerować PDF.')
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="research-panel">
      <div className="research-intro">
        <FlaskConical size={16} />
        <div>
          <h3>Badania porównawcze — wpływ struktury grafu na wydajność</h3>
          <p>
            Automatyczna seria pomiarów dla pary algorytmów rozwiązujących <b>ten sam problem</b>.
            Oba algorytmy otrzymują identyczny graf w każdym przypadku. Czas generowania jest oddzielony od czasu algorytmu.
          </p>
        </div>
      </div>

      <div className="research-grid">
        <section className="panel">
          <div className="panel-header"><h3>1. Konfiguracja badań</h3></div>
          <div className="research-form">
            <label htmlFor="res-name">Nazwa serii</label>
            <input id="res-name" value={config.name} disabled={busy} onChange={e => patch('name', e.target.value)} />

            <label htmlFor="res-kind">Rodzaj badania</label>
            <select id="res-kind" value={config.studyKind} disabled={busy} onChange={e => patch('studyKind', e.target.value as StudyKind)}>
              {(Object.keys(STUDY_KIND_LABELS) as StudyKind[]).map(k => (
                <option key={k} value={k}>{STUDY_KIND_LABELS[k]}</option>
              ))}
            </select>

            <label htmlFor="res-group">Grupa algorytmów</label>
            <select
              id="res-group"
              value={config.group}
              disabled={busy}
              onChange={e => patch('group', e.target.value as AlgorithmProblemGroup)}
            >
              {(Object.keys(PROBLEM_GROUP_LABELS) as AlgorithmProblemGroup[]).map(g => (
                <option key={g} value={g}>
                  {PROBLEM_GROUP_LABELS[g]} ({algorithmLabels[ALGORITHM_PAIR_BY_GROUP[g][0]]} vs {algorithmLabels[ALGORITHM_PAIR_BY_GROUP[g][1]]})
                </option>
              ))}
            </select>
            <p className="research-hint">
              Wybrana para: <b>{algorithmLabels[pair[0]]}</b> i <b>{algorithmLabels[pair[1]]}</b>.
              Nie porównujemy algorytmów z różnych kategorii problemów.
            </p>

            {(config.studyKind === 'vertices' || config.studyKind === 'structure') && (
              <>
                <label htmlFor="res-topo">Rodzaj grafu (dla badania A)</label>
                <select
                  id="res-topo"
                  value={config.topology}
                  disabled={busy || config.studyKind === 'structure'}
                  onChange={e => patch('topology', e.target.value as GraphTopology)}
                >
                  {RESEARCH_TOPOLOGIES.map(t => (
                    <option key={t} value={t}>{topologyLabels[t]}</option>
                  ))}
                </select>
              </>
            )}

            {config.studyKind === 'vertices' && (
              <>
                <label htmlFor="res-vsizes">Zakres V (po przecinku)</label>
                <input
                  id="res-vsizes"
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.vertexSizes}
                  onChange={e => patchDraft('vertexSizes', acceptNumberListDraft(drafts.vertexSizes, e.target.value))}
                  onBlur={() => {
                    const parsed = parseNumberList(drafts.vertexSizes, { label: 'Zakres V', min: 2, max: MAX_VERTICES, minCount: 1 })
                    if (parsed.ok) {
                      patch('vertexSizes', parsed.value)
                      patchDraft('vertexSizes', formatNumberList(parsed.value))
                    }
                  }}
                />
                <p className="research-hint">V = liczba wierzchołków. Dla Bellmana–Forda bezpiecznie ≤ 1000.</p>
              </>
            )}

            {(config.studyKind === 'edges' || config.studyKind === 'density' || config.studyKind === 'structure') && (
              <>
                <label htmlFor="res-v">Stała liczba wierzchołków V</label>
                <input
                  id="res-v"
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.vertices}
                  onChange={e => patchDraft('vertices', acceptNumericDraft(drafts.vertices, e.target.value))}
                  onBlur={() => {
                    const parsed = parseIntField(drafts.vertices, { label: 'V', min: 2, max: MAX_VERTICES })
                    if (parsed.ok) {
                      patch('vertices', parsed.value)
                      patchDraft('vertices', String(parsed.value))
                    }
                  }}
                />
              </>
            )}

            {config.studyKind === 'edges' && (
              <>
                <label htmlFor="res-esweep">Zakres liczby krawędzi E (po przecinku)</label>
                <input
                  id="res-esweep"
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.edgeSweep}
                  onChange={e => patchDraft('edgeSweep', acceptNumberListDraft(drafts.edgeSweep, e.target.value))}
                  onBlur={() => {
                    const parsed = parseNumberList(drafts.edgeSweep, { label: 'Zakres E', min: 1, max: MAX_EDGES, minCount: 1 })
                    if (parsed.ok) {
                      patch('edgeSweep', parsed.value)
                      patchDraft('edgeSweep', formatNumberList(parsed.value))
                    }
                  }}
                />
                <p className="research-hint">E = liczba krawędzi przy stałym V (generator Erdős–Rényi, spójny).</p>
              </>
            )}

            {config.studyKind === 'density' && (
              <>
                <label htmlFor="res-dsweep">Zakres gęstości % (po przecinku)</label>
                <input
                  id="res-dsweep"
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.densitySweep}
                  onChange={e => patchDraft('densitySweep', acceptNumberListDraft(drafts.densitySweep, e.target.value))}
                  onBlur={() => {
                    const parsed = parseNumberList(drafts.densitySweep, { label: 'Zakres gęstości %', min: 1, max: 100, minCount: 1 })
                    if (parsed.ok) {
                      patch('densitySweep', parsed.value)
                      patchDraft('densitySweep', formatNumberList(parsed.value))
                    }
                  }}
                />
                <p className="research-hint">
                  Gęstość ≈ E / E<sub>max</sub> · 100%. Nie mylić z surową liczbą krawędzi.
                </p>
              </>
            )}

            {config.studyKind === 'vertices' && (
              <>
                <label htmlFor="res-den">Gęstość bazowa (%)</label>
                <input
                  id="res-den"
                  disabled={busy || config.topology === 'sparse' || config.topology === 'dense' || config.topology === 'complete'}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.densityPercent}
                  onChange={e => patchDraft('densityPercent', acceptNumericDraft(drafts.densityPercent, e.target.value))}
                  onBlur={() => {
                    const parsed = parseIntField(drafts.densityPercent, { label: 'Gęstość bazowa (%)', min: 1, max: 100 })
                    if (parsed.ok) {
                      patch('densityPercent', parsed.value)
                      patchDraft('densityPercent', String(parsed.value))
                    }
                  }}
                />
              </>
            )}

            <div className="research-inline">
              <label>
                Powtórzenia
                <input
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.repetitions}
                  onChange={e => patchDraft('repetitions', acceptNumericDraft(drafts.repetitions, e.target.value))}
                  onBlur={() => {
                    const parsed = parseIntField(drafts.repetitions, { label: 'Powtórzenia', min: 1, max: 100 })
                    if (parsed.ok) {
                      patch('repetitions', parsed.value)
                      patchDraft('repetitions', String(parsed.value))
                    }
                  }}
                />
              </label>
              <label>
                Seed
                <input
                  disabled={busy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={drafts.seed}
                  onChange={e => patchDraft('seed', acceptNumericDraft(drafts.seed, e.target.value))}
                  onBlur={() => {
                    const parsed = parseIntField(drafts.seed, { label: 'Seed', min: 0, max: 2_147_483_647 })
                    if (parsed.ok) {
                      patch('seed', parsed.value)
                      patchDraft('seed', String(parsed.value))
                    }
                  }}
                />
              </label>
            </div>
            <p className="research-hint">
              Seed bazowy + deterministyczne przesunięcia dają powtarzalną serię instancji dla obu algorytmów.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h3>2. Hipoteza badawcza</h3></div>
          <div className="research-form">
            <label htmlFor="res-h">Hipoteza</label>
            <select
              id="res-h"
              disabled={busy}
              value={config.hypothesis}
              onChange={e => patch('hypothesis', e.target.value as HypothesisId)}
            >
              {(Object.keys(HYPOTHESIS_LABELS) as HypothesisId[]).map(h => (
                <option key={h} value={h}>{HYPOTHESIS_LABELS[h]}</option>
              ))}
            </select>
            <p className="research-hint">
              Po serii możesz oznaczyć hipotezę jako wspieraną / niewspieraną / nierozstrzygniętą.
              Nie oznaczaj „potwierdzenia” na podstawie jednego pomiaru.
            </p>
          </div>

          <div className="panel-header" style={{ borderTop: '1px solid #28364c' }}><h3>3. Plan serii</h3></div>
          <div className="research-plan">
            <p className="research-hint">{plan.length} przypadków · para {algorithmLabels[pair[0]]}/{algorithmLabels[pair[1]]}</p>
            <ol>
              {plan.slice(0, 16).map(p => (
                <li key={p.id} className={p.warning ? 'is-warn' : ''}>
                  <strong>{p.label}</strong>
                  <span>{topologyLabels[p.topology]} · seed {p.seed}</span>
                  {p.warning && <em>{p.warning}</em>}
                </li>
              ))}
            </ol>
            {plan.length > 16 && <p className="research-hint">…i {plan.length - 16} kolejnych</p>}
            {warnings.map(w => <p key={w} className="research-warning">{w}</p>)}
          </div>

          <div className="research-actions">
            {!busy ? (
              <button type="button" className="btn btn-primary" onClick={run}>
                <Play size={15} /> Uruchom serię
              </button>
            ) : (
              <button type="button" className="btn btn-outline" onClick={cancel}>
                <Square size={15} /> Anuluj
              </button>
            )}
          </div>
          <div className="bench-progress" aria-hidden>
            <div className="bench-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <p className="bench-status">{status}</p>
        </section>
      </div>

      {study && (
        <>
          <section className="panel research-results">
            <div className="panel-header">
              <h3>5. Wyniki tabelaryczne — {study.name}</h3>
              <div className="bench-actions">
                <button type="button" className="btn btn-outline" onClick={persist}><Save size={14} /> Zapisz serię</button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={exportBusy}
                  onClick={() => downloadTextFile(`${study.name}.json`, exportResearchJSON(study), 'application/json')}
                >
                  <Download size={14} /> JSON
                </button>
                <button type="button" className="btn btn-outline" disabled={exportBusy} onClick={() => { void exportPng() }}>
                  <Download size={14} /> PNG
                </button>
                <button type="button" className="btn btn-primary" disabled={exportBusy} onClick={() => { void exportPdf() }}>
                  <Download size={14} /> PDF
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Przypadek</th>
                    <th>Topologia</th>
                    <th>V</th>
                    <th>E</th>
                    <th>Gęstość %</th>
                    <th>Spójny</th>
                    <th>Algorytm</th>
                    <th>Śr. ms</th>
                    <th>Med. ms</th>
                    <th>σ</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Operacje</th>
                    <th>Status</th>
                    <th>Gen. ms</th>
                  </tr>
                </thead>
                <tbody>
                  {study.cases.flatMap(c => c.results.map(r => (
                    <tr key={`${c.plan.id}-${r.algorithm}`} className={(r.status ?? 'ran') !== 'ran' ? 'is-muted' : ''}>
                      <td>{c.plan.label}</td>
                      <td>{topologyLabels[c.plan.topology]}</td>
                      <td>{c.actualVertices}</td>
                      <td>{c.actualEdges}</td>
                      <td>{fmt(c.actualDensity)}</td>
                      <td>{c.connected ? 'tak' : 'nie'}</td>
                      <td>{algorithmLabels[r.algorithm]}</td>
                      <td>{fmt(r.mean)}</td>
                      <td>{fmt(r.median)}</td>
                      <td>{fmt(r.stdDev)}</td>
                      <td>{fmt(r.min)}</td>
                      <td>{fmt(r.max)}</td>
                      <td>{r.operations}</td>
                      <td>{r.status ?? 'ran'}{r.skipReason ? ` — ${r.skipReason}` : ''}</td>
                      <td>{fmt(c.generateMs)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" id="research-chart-capture">
            <div className="panel-header">
              <h3>6. Wykresy</h3>
              <span className="research-hint">
                Średni czas [ms] · n={study.config.repetitions} powtórzeń · {STUDY_KIND_LABELS[study.config.studyKind]}
              </span>
            </div>
            <div className="research-chart" ref={chartRef}>
              <ResponsiveContainer width="100%" height={320}>
                {study.config.studyKind === 'structure' ? (
                  <BarChart data={chartByX}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#28364c" />
                    <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis stroke="#94a3b8" label={{ value: 'Czas [ms]', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                    <Tooltip />
                    <Legend />
                    {pair.map(id => (
                      <Bar key={id} dataKey={id} name={`${algorithmLabels[id]} (średnia)`} fill={colors[id]} />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={chartByX}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#28364c" />
                    <XAxis
                      dataKey="x"
                      stroke="#94a3b8"
                      label={{
                        value: study.config.studyKind === 'edges'
                          ? 'Liczba krawędzi E'
                          : study.config.studyKind === 'density'
                            ? 'Gęstość [%]'
                            : 'Liczba wierzchołków V',
                        position: 'insideBottom',
                        offset: -2,
                        fill: '#94a3b8',
                      }}
                    />
                    <YAxis stroke="#94a3b8" label={{ value: 'Średni czas [ms]', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                    <Tooltip />
                    <Legend />
                    {pair.map(id => (
                      <Line
                        key={id}
                        type="monotone"
                        dataKey={id}
                        name={`${algorithmLabels[id]} (średnia)`}
                        stroke={colors[id]}
                        strokeWidth={2}
                        dot
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><h3>7. Interpretacja i wnioski</h3></div>
            <div className="research-interpret">
              <ul>
                {study.interpretation.map(line => <li key={line}>{line}</li>)}
              </ul>
              <div className="research-hypothesis-box">
                <p><b>Hipoteza:</b> {HYPOTHESIS_LABELS[study.config.hypothesis]}</p>
                <p><b>Status:</b> {verdictLabel[study.hypothesisVerdict]}</p>
                <p>{study.hypothesisNote}</p>
                <div className="bench-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setVerdict('supported')}>Wspierana</button>
                  <button type="button" className="btn btn-outline" onClick={() => setVerdict('unsupported')}>Niewspierana</button>
                  <button type="button" className="btn btn-outline" onClick={() => setVerdict('inconclusive')}>Nierozstrzygnięta</button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="panel">
        <div className="panel-header"><h3>8. Zapisane badania</h3></div>
        <div className="research-saved">
          {!saved.length && <p className="research-hint">Brak zapisanych serii.</p>}
          {saved.map(s => (
            <div key={s.id} className="research-saved-row">
              <div>
                <strong>{s.name}</strong>
                <span>{new Date(s.createdAt).toLocaleString('pl-PL')} · {s.cases.length} przypadków · {STUDY_KIND_LABELS[s.config.studyKind]}</span>
              </div>
              <div className="bench-actions">
                <button type="button" className="btn btn-outline" onClick={() => loadSaved(s.id)}>Otwórz</button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setConfig(s.config)
                    setStatus('Wczytano parametry — uruchom serię, aby odtworzyć pomiary z tymi samymi seedami.')
                  }}
                >
                  Odtwórz parametry
                </button>
                <button type="button" className="btn btn-outline" onClick={() => removeSaved(s.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
