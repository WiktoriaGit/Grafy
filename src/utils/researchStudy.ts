/**
 * Planowanie i analiza serii badań porównawczych (praca inżynierska).
 * Nie uruchamia algorytmów — tylko konfiguracja, interpretacja i eksport.
 */
import {
  algorithmLabels,
  exportCSV,
  type AlgorithmId,
  type BenchResult,
} from './benchmark'
import {
  PROBLEM_GROUP_LABELS,
  type AlgorithmProblemGroup,
} from './benchEligibility'
import {
  DENSE_DENSITY_PERCENT,
  estimateEdgeCount,
  MAX_COMPLETE_BIPARTITE_VERTICES,
  MAX_EDGES,
  MAX_VERTICES,
  RESEARCH_TOPOLOGIES,
  SPARSE_DENSITY_PERCENT,
  topologyLabels,
  validateGeneratorParams,
  type GeneratorParams,
  type GraphTopology,
} from './largeGraphs'

export type StudyKind = 'vertices' | 'edges' | 'structure' | 'density'
export type HypothesisId = 'H1' | 'H2' | 'H3' | 'H4'
export type HypothesisVerdict = 'supported' | 'unsupported' | 'inconclusive' | 'unset'

export const STUDY_KIND_LABELS: Record<StudyKind, string> = {
  vertices: 'Badanie A — wpływ liczby wierzchołków',
  edges: 'Badanie B — wpływ liczby krawędzi',
  structure: 'Badanie C — wpływ rodzaju grafu',
  density: 'Badanie D — grafy rzadkie i gęste',
}

export const HYPOTHESIS_LABELS: Record<HypothesisId, string> = {
  H1: 'H1: Zwiększanie liczby krawędzi przy stałej liczbie wierzchołków wpływa na czas wykonania algorytmów.',
  H2: 'H2: Różnice w czasie wykonania Dijkstry i Bellmana–Forda rosną wraz ze wzrostem rozmiaru grafu.',
  H3: 'H3: Struktura grafu wpływa na względną wydajność algorytmów Prima i Kruskala.',
  H4: 'H4: BFS i DFS wykazują różnice wydajności w zależności od struktury grafu, mimo podobnej asymptotycznej złożoności.',
}

export const ALGORITHM_PAIR_BY_GROUP: Record<AlgorithmProblemGroup, [AlgorithmId, AlgorithmId]> = {
  search: ['bfs', 'dfs'],
  shortest: ['dijkstra', 'bellman'],
  mst: ['prim', 'kruskal'],
}

export const DEFAULT_VERTEX_SWEEP = [100, 500, 1000, 2000, 5000] as const
export const SAFE_VERTEX_SWEEP_WITH_BELLMAN = [100, 400, 800, 1000] as const
export const DEFAULT_EDGE_SWEEP = [200, 500, 1000, 2500, 5000, 10000] as const
export const DEFAULT_DENSITY_SWEEP = [5, 15, 30, 45, 60] as const

export type ResearchConfig = {
  name: string
  studyKind: StudyKind
  group: AlgorithmProblemGroup
  topology: GraphTopology
  topologies?: GraphTopology[]
  vertices: number
  vertexSizes: number[]
  densityPercent: number
  densitySweep: number[]
  edgeSweep: number[]
  repetitions: number
  seed: number
  weightMin: number
  weightMax: number
  directed: boolean
  hypothesis: HypothesisId
}

export type ResearchCasePlan = {
  id: string
  index: number
  label: string
  studyKind: StudyKind
  topology: GraphTopology
  vertices: number
  densityPercent: number
  edgeCount?: number
  seed: number
  algorithms: [AlgorithmId, AlgorithmId]
  generator: GeneratorParams
  warning?: string
}

export type ResearchCaseResult = {
  plan: ResearchCasePlan
  generateMs: number
  actualVertices: number
  actualEdges: number
  actualDensity: number
  connected: boolean
  results: BenchResult[]
}

export type ResearchStudy = {
  id: string
  name: string
  createdAt: string
  /** Czas ostatniej aktualizacji — używany przy synchronizacji z SQLite. */
  updatedAt?: string
  config: ResearchConfig
  plan: ResearchCasePlan[]
  cases: ResearchCaseResult[]
  interpretation: string[]
  hypothesisVerdict: HypothesisVerdict
  hypothesisNote: string
}

export type ResearchRequest = {
  studyId: string
  name: string
  config: ResearchConfig
  plan: ResearchCasePlan[]
}

const STORAGE_KEY = 'graphlab-research-studies-v1'
const MAX_STORED_STUDIES = 20

function deriveCaseSeed(base: number, index: number): number {
  return (base + index * 9973) >>> 0
}

function clampVertices(n: number, topology: GraphTopology, algorithms: AlgorithmId[]): number {
  let max = Math.min(MAX_VERTICES, n)
  if (topology === 'complete') max = Math.min(max, 450)
  if (topology === 'completeBipartite') max = Math.min(max, MAX_COMPLETE_BIPARTITE_VERTICES)
  if (algorithms.includes('bellman')) max = Math.min(max, 1000)
  return Math.max(2, Math.floor(max))
}

export function warnAboutCostlyCases(config: ResearchConfig, plan: ResearchCasePlan[]): string[] {
  const warnings: string[] = []
  if (config.group === 'shortest' && config.vertexSizes.some(v => v > 1000)) {
    warnings.push('Bellman–Ford jest ograniczony do 1000 wierzchołków — większe punkty zostaną przycięte lub pominięte.')
  }
  for (const item of plan) {
    const edges = estimateEdgeCount(item.generator)
    if (edges > 40000 && config.group === 'shortest') {
      warnings.push(`Przypadek „${item.label}” ma ok. ${edges.toLocaleString('pl-PL')} krawędzi — Bellman–Ford może być kosztowny.`)
      break
    }
    if (item.vertices >= 5000 && item.generator.densityPercent >= 30) {
      warnings.push(`Duży i stosunkowo gęsty przypadek „${item.label}” może zająć dużo czasu i pamięci.`)
      break
    }
  }
  if (plan.length > 24) {
    warnings.push(`Seria obejmuje ${plan.length} przypadków — rozważ mniejszy zakres przy pierwszym uruchomieniu.`)
  }
  return [...new Set(warnings)]
}

export function buildResearchPlan(config: ResearchConfig): ResearchCasePlan[] {
  const algorithms = ALGORITHM_PAIR_BY_GROUP[config.group]
  const plans: ResearchCasePlan[] = []

  const push = (partial: Omit<ResearchCasePlan, 'id' | 'index' | 'algorithms' | 'generator' | 'studyKind'> & {
    edgeCount?: number
    warning?: string
  }) => {
    const vertices = clampVertices(partial.vertices, partial.topology, algorithms)
    const densityPercent = partial.topology === 'sparse'
      ? SPARSE_DENSITY_PERCENT
      : partial.topology === 'dense'
        ? DENSE_DENSITY_PERCENT
        : partial.densityPercent
    const generator: GeneratorParams = {
      topology: partial.topology === 'custom' ? 'erdos' : partial.topology,
      vertices,
      densityPercent,
      edgeCount: partial.edgeCount,
      seed: partial.seed,
      weightMin: config.weightMin,
      weightMax: config.weightMax,
      directed: config.group === 'mst' ? false : config.directed,
    }
    const validation = validateGeneratorParams(generator)
    if (!validation.ok) {
      plans.push({
        id: `skip-${plans.length}`,
        index: plans.length,
        label: partial.label,
        studyKind: config.studyKind,
        topology: partial.topology,
        vertices,
        densityPercent,
        edgeCount: partial.edgeCount,
        seed: partial.seed,
        algorithms,
        generator,
        warning: validation.message,
      })
      return
    }
    const expected = estimateEdgeCount(generator)
    if (algorithms.includes('bellman') && (vertices > 1000 || expected > 25000)) {
      plans.push({
        id: `skip-${plans.length}`,
        index: plans.length,
        label: partial.label,
        studyKind: config.studyKind,
        topology: partial.topology,
        vertices,
        densityPercent,
        edgeCount: partial.edgeCount,
        seed: partial.seed,
        algorithms,
        generator,
        warning: 'Przypadek przekracza bezpieczny limit Bellmana–Forda (1000 V / 25 000 E).',
      })
      return
    }
    plans.push({
      id: `case-${plans.length}`,
      index: plans.length,
      label: partial.label,
      studyKind: config.studyKind,
      topology: partial.topology,
      vertices,
      densityPercent,
      edgeCount: partial.edgeCount,
      seed: partial.seed,
      algorithms,
      generator,
      warning: partial.warning,
    })
  }

  if (config.studyKind === 'vertices') {
    const sizes = (config.vertexSizes.length ? config.vertexSizes : [...DEFAULT_VERTEX_SWEEP])
      .map(n => clampVertices(n, config.topology, algorithms))
    const unique = [...new Set(sizes)].sort((a, b) => a - b)
    unique.forEach((vertices, index) => {
      push({
        label: `V=${vertices}`,
        topology: config.topology,
        vertices,
        densityPercent: config.densityPercent,
        seed: deriveCaseSeed(config.seed, index),
      })
    })
  } else if (config.studyKind === 'edges') {
    const vertices = clampVertices(config.vertices, config.topology, algorithms)
    const edges = (config.edgeSweep.length ? config.edgeSweep : [...DEFAULT_EDGE_SWEEP])
      .map(e => Math.max(vertices - 1, Math.floor(e)))
    const unique = [...new Set(edges)].sort((a, b) => a - b)
    unique.forEach((edgeCount, index) => {
      if (edgeCount > MAX_EDGES) return
      push({
        label: `V=${vertices}, E≈${edgeCount}`,
        topology: 'erdos',
        vertices,
        densityPercent: config.densityPercent,
        edgeCount,
        seed: deriveCaseSeed(config.seed, index),
      })
    })
  } else if (config.studyKind === 'structure') {
    const topologies = (config.topologies?.length ? config.topologies : RESEARCH_TOPOLOGIES)
      .filter(t => t !== 'custom' && t !== 'grid')
    const vertices = clampVertices(config.vertices, 'erdos', algorithms)
    topologies.forEach((topology, index) => {
      const v = clampVertices(vertices, topology, algorithms)
      push({
        label: topologyLabels[topology],
        topology,
        vertices: v,
        densityPercent: config.densityPercent,
        seed: deriveCaseSeed(config.seed, index),
      })
    })
  } else {
    const vertices = clampVertices(config.vertices, 'erdos', algorithms)
    const densities = (config.densitySweep.length ? config.densitySweep : [...DEFAULT_DENSITY_SWEEP])
      .map(d => Math.min(100, Math.max(1, d)))
    const unique = [...new Set(densities)].sort((a, b) => a - b)
    unique.forEach((densityPercent, index) => {
      push({
        label: `V=${vertices}, gęstość ${densityPercent}%`,
        topology: 'erdos',
        vertices,
        densityPercent,
        seed: deriveCaseSeed(config.seed, index),
      })
    })
  }

  return plans
}

/** Filtruje przypadki wykonywalne (bez ostrzeżenia blokującego). */
export function executablePlans(plan: ResearchCasePlan[]): ResearchCasePlan[] {
  return plan.filter(p => !p.warning && validateGeneratorParams(p.generator).ok)
}

export function buildInterpretation(study: Pick<ResearchStudy, 'config' | 'cases'>): string[] {
  const lines: string[] = []
  const ranCases = study.cases.filter(c => c.results.some(r => (r.status ?? 'ran') === 'ran'))
  if (!ranCases.length) {
    return ['Brak ukończonych pomiarów — nie wygenerowano automatycznej interpretacji.']
  }

  const [a, b] = ALGORITHM_PAIR_BY_GROUP[study.config.group]
  const labelA = algorithmLabels[a]
  const labelB = algorithmLabels[b]
  lines.push(
    `Porównanie dotyczy kategorii „${PROBLEM_GROUP_LABELS[study.config.group]}”: ${labelA} vs ${labelB}.`,
  )
  lines.push(
    'Nie porównujemy algorytmów z różnych kategorii problemów (np. BFS z wagą MST).',
  )

  let winsA = 0
  let winsB = 0
  let ties = 0
  let inconclusive = 0

  for (const item of ranCases) {
    const ra = item.results.find(r => r.algorithm === a && (r.status ?? 'ran') === 'ran')
    const rb = item.results.find(r => r.algorithm === b && (r.status ?? 'ran') === 'ran')
    if (!ra || !rb) continue
    const gap = Math.abs(ra.mean - rb.mean)
    const noise = Math.max(ra.stdDev, rb.stdDev, 0.05)
    if (gap < 2 * noise) {
      inconclusive++
      continue
    }
    if (ra.mean < rb.mean) winsA++
    else if (rb.mean < ra.mean) winsB++
    else ties++
  }

  const sample = ranCases.find(c => {
    const ra = c.results.find(r => r.algorithm === a && (r.status ?? 'ran') === 'ran')
    const rb = c.results.find(r => r.algorithm === b && (r.status ?? 'ran') === 'ran')
    return ra && rb
  })
  if (sample) {
    const ra = sample.results.find(r => r.algorithm === a)!
    const rb = sample.results.find(r => r.algorithm === b)!
    const faster = ra.mean <= rb.mean ? ra : rb
    const slower = ra.mean <= rb.mean ? rb : ra
    const pct = slower.mean > 0 ? ((slower.mean - faster.mean) / slower.mean) * 100 : 0
    lines.push(
      `Przykład (przypadek „${sample.plan.label}”, V=${sample.actualVertices}, E=${sample.actualEdges}): `
      + `${algorithmLabels[faster.algorithm]} ${faster.mean.toFixed(2)} ms vs `
      + `${algorithmLabels[slower.algorithm]} ${slower.mean.toFixed(2)} ms `
      + `(różnica ~${pct.toFixed(1)}% względem wolniejszego; n=${faster.repetitions} powtórzeń).`,
    )
  }

  lines.push(
    `W ${ranCases.length} ukończonych przypadkach: ${labelA} szybszy w ${winsA}, `
    + `${labelB} szybszy w ${winsB}, remisy ${ties}, `
    + `różnice niejednoznaczne względem zmienności: ${inconclusive}.`,
  )

  if (study.config.studyKind === 'vertices' || study.config.studyKind === 'edges') {
    const first = ranCases[0]
    const last = ranCases[ranCases.length - 1]
    const scaleKey = study.config.studyKind === 'vertices' ? 'actualVertices' : 'actualEdges'
    lines.push(
      `Wraz ze wzrostem ${study.config.studyKind === 'vertices' ? 'V' : 'E'} `
      + `od ${first[scaleKey]} do ${last[scaleKey]} obserwowano zmiany średnich czasów — `
      + 'szczegóły na wykresie serii. Pojedynczy punkt nie wystarcza do uogólnień.',
    )
  }

  if (study.config.studyKind === 'density' || study.config.studyKind === 'structure') {
    lines.push(
      'Różnice między strukturami/gęstościami należy czytać łącznie z odchyleniem standardowym i liczbą powtórzeń.',
    )
  }

  lines.push(
    `Oczekiwania asymptotyczne: ${complexityHint(study.config.group)}. `
    + 'Zgodność empiryczna zależy od implementacji, stałych i maszyny.',
  )

  return lines
}

function complexityHint(group: AlgorithmProblemGroup): string {
  if (group === 'search') return 'BFS i DFS mają złożoność O(V+E) — różnice zwykle wynikają ze stałych i kolejności odwiedzin'
  if (group === 'shortest') return 'Dijkstra z kopcem ≈ O((V+E) log V), Bellman–Ford ≈ O(V·E)'
  return 'Prim z kopcem ≈ O((V+E) log V), Kruskal ≈ O(E log E) (sortowanie + Union-Find)'
}

const HEURISTIC_DISCLAIMER =
  'Sugestia automatyczna jest heurystyczną interpretacją wyników (nie formalnym testem statystycznym) — ostateczną ocenę należy sformułować ręcznie.'

type PairPoint = {
  caseIndex: number
  label: string
  vertices: number
  edges: number
  density: number
  topology: GraphTopology
  meanA: number
  meanB: number
  stdA: number
  stdB: number
  gap: number
  noise: number
  significant: boolean
  faster: AlgorithmId | null
}

function collectCompletePairs(
  study: Pick<ResearchStudy, 'config' | 'cases'>,
  algoA: AlgorithmId,
  algoB: AlgorithmId,
): PairPoint[] {
  const points: PairPoint[] = []
  for (const item of study.cases) {
    const ra = item.results.find(r => r.algorithm === algoA && (r.status ?? 'ran') === 'ran')
    const rb = item.results.find(r => r.algorithm === algoB && (r.status ?? 'ran') === 'ran')
    // Tylko kompletne, poprawne pary — bez uzupełniania zerami.
    if (!ra || !rb) continue
    if (!Number.isFinite(ra.mean) || !Number.isFinite(rb.mean)) continue
    const gap = Math.abs(ra.mean - rb.mean)
    const noise = Math.max(ra.stdDev || 0, rb.stdDev || 0, 0.05)
    const significant = gap >= 2 * noise
    points.push({
      caseIndex: item.plan.index,
      label: item.plan.label,
      vertices: item.actualVertices,
      edges: item.actualEdges,
      density: item.actualDensity,
      topology: item.plan.topology,
      meanA: ra.mean,
      meanB: rb.mean,
      stdA: ra.stdDev || 0,
      stdB: rb.stdDev || 0,
      gap,
      noise,
      significant,
      faster: significant ? (ra.mean < rb.mean ? algoA : algoB) : null,
    })
  }
  return points
}

function withDisclaimer(note: string): string {
  return `${note} ${HEURISTIC_DISCLAIMER}`
}

function mismatchNote(expected: string): { verdict: HypothesisVerdict; note: string } {
  return {
    verdict: 'inconclusive',
    note: withDisclaimer(
      `Hipoteza nie pasuje do konfiguracji badania (${expected}). Sugestia automatyczna nie rozstrzyga wyniku.`,
    ),
  }
}

/** Czy czasy rosną wraz z czynnikiem X (porównanie pierwszego i ostatniego punktu po sortowaniu). */
function endpointRise(
  sorted: Array<{ x: number; y: number; noise: number }>,
  factor = 1.25,
): 'up' | 'down' | 'flat' {
  if (sorted.length < 2) return 'flat'
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const delta = last.y - first.y
  const scale = Math.max(first.noise, last.noise, 0.05)
  if (Math.abs(delta) < 2 * scale) return 'flat'
  if (last.y > first.y * factor && last.y > first.y + 2 * scale) return 'up'
  if (last.y < first.y / factor && last.y < first.y - 2 * scale) return 'down'
  return 'flat'
}

export function suggestHypothesisVerdict(study: Pick<ResearchStudy, 'config' | 'cases'>): {
  verdict: HypothesisVerdict
  note: string
} {
  const h = study.config.hypothesis
  const kind = study.config.studyKind
  const group = study.config.group
  const [pairA, pairB] = ALGORITHM_PAIR_BY_GROUP[group]
  const points = collectCompletePairs(study, pairA, pairB)

  if (points.length < 2) {
    return {
      verdict: 'inconclusive',
      note: withDisclaimer(
        'Za mało kompletnych, poprawnych par pomiarowych (wymagane ≥ 2), by rozstrzygnąć hipotezę.',
      ),
    }
  }

  // ——— H1: wpływ liczby krawędzi (stałe V) na czas ———
  if (h === 'H1') {
    if (kind !== 'edges' && kind !== 'density') {
      return mismatchNote('oczekiwane badanie edges lub density przy stałej liczbie wierzchołków')
    }
    // Średni czas obu algorytmów vs liczba krawędzi (lub gęstość).
    const byEdges = [...points].sort((p, q) => p.edges - q.edges || p.density - q.density)
    const seriesA = byEdges.map(p => ({ x: p.edges, y: p.meanA, noise: Math.max(p.stdA, 0.05) }))
    const seriesB = byEdges.map(p => ({ x: p.edges, y: p.meanB, noise: Math.max(p.stdB, 0.05) }))
    const riseA = endpointRise(seriesA)
    const riseB = endpointRise(seriesB)
    const vFixed = byEdges.every(p => p.vertices === byEdges[0].vertices)
    const edgeSpan = byEdges[byEdges.length - 1].edges - byEdges[0].edges
    if (edgeSpan <= 0) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer('Liczba krawędzi nie zmienia się między przypadkami — nie można ocenić H1.'),
      }
    }
    if (riseA === 'up' || riseB === 'up') {
      return {
        verdict: 'supported',
        note: withDisclaimer(
          `Zaobserwowano wzrost czasu wraz ze wzrostem liczby krawędzi`
          + `${vFixed ? ' przy stałym V' : ' (V nie było w pełni stałe)'}`
          + ` dla co najmniej jednego algorytmu z pary ${algorithmLabels[pairA]}/${algorithmLabels[pairB]}.`,
        ),
      }
    }
    if (riseA === 'flat' && riseB === 'flat') {
      return {
        verdict: 'unsupported',
        note: withDisclaimer(
          'W tej serii czasy nie rosną wyraźnie wraz z liczbą krawędzi (względem zmienności) — H1 nie jest wspierana tymi danymi.',
        ),
      }
    }
    return {
      verdict: 'inconclusive',
      note: withDisclaimer('Trend czasów względem liczby krawędzi nie jest jednoznaczny względem zmienności pomiarów.'),
    }
  }

  // ——— H2: luka Dijkstra–Bellman rośnie z rozmiarem ———
  if (h === 'H2') {
    if (group !== 'shortest' || (pairA !== 'dijkstra' && pairB !== 'dijkstra')) {
      return mismatchNote('oczekiwana para Dijkstra / Bellman–Ford (grupa shortest)')
    }
    if (kind !== 'vertices') {
      return mismatchNote('oczekiwane badanie vertices (wzrost rozmiaru grafu)')
    }
    const byV = [...points].sort((p, q) => p.vertices - q.vertices)
    if (byV[byV.length - 1].vertices <= byV[0].vertices) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer('Rozmiar grafu (V) nie rośnie w serii — nie można ocenić H2.'),
      }
    }
    const gapSeries = byV.map(p => ({
      x: p.vertices,
      y: p.gap,
      noise: Math.max(p.noise, 0.05),
    }))
    const trend = endpointRise(gapSeries, 1.3)
    // Wymagaj też, by luka na końcu była znacząca względem szumu.
    const lastSig = byV[byV.length - 1].significant
    if (trend === 'up' && lastSig) {
      return {
        verdict: 'supported',
        note: withDisclaimer(
          'Różnica czasów Dijkstra–Bellman rosła wraz z liczbą wierzchołków w tej serii (z uwzględnieniem zmienności).',
        ),
      }
    }
    if (trend === 'down' || (trend === 'flat' && !lastSig)) {
      return {
        verdict: 'unsupported',
        note: withDisclaimer(
          'W tej serii różnica czasów Dijkstra–Bellman nie rosła wyraźnie wraz z rozmiarem — H2 nie jest wspierana tymi danymi.',
        ),
      }
    }
    return {
      verdict: 'inconclusive',
      note: withDisclaimer('Trend różnicy czasów względem rozmiaru nie jest jednoznaczny względem zmienności.'),
    }
  }

  // ——— H3: struktura wpływa na względną wydajność Prima i Kruskala ———
  if (h === 'H3') {
    if (group !== 'mst') {
      return mismatchNote('oczekiwana para Prim / Kruskal (grupa mst)')
    }
    if (kind !== 'structure') {
      return mismatchNote('oczekiwane badanie structure (różne topologie)')
    }
    const topologies = new Set(points.map(p => p.topology))
    if (topologies.size < 2) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer('Za mało różnych topologii w kompletnych parach — nie można ocenić H3.'),
      }
    }
    const edgeVals = points.map(p => p.edges)
    const densVals = points.map(p => p.density)
    const edgeRange = Math.max(...edgeVals) - Math.min(...edgeVals)
    const densRange = Math.max(...densVals) - Math.min(...densVals)
    const confound =
      edgeRange > Math.max(1, Math.min(...edgeVals) * 0.15)
      || densRange > 5

    const winners = points.filter(p => p.faster != null).map(p => p.faster!)
    const distinctWinners = new Set(winners)
    const sigGaps = points.filter(p => p.significant)
    const gapVals = sigGaps.map(p => p.gap)
    const gapSpread = gapVals.length >= 2
      ? Math.max(...gapVals) / Math.max(Math.min(...gapVals), 1e-9)
      : 1

    if (distinctWinners.size >= 2 || gapSpread >= 1.5) {
      return {
        verdict: 'supported',
        note: withDisclaimer(
          `Zaobserwowano zmiany względnej wydajności Prima/Kruskala między topologiami`
          + (confound
            ? '. Uwaga: jednocześnie zmieniały się liczba krawędzi i/lub gęstość — efektu nie należy przypisywać wyłącznie strukturze.'
            : '.'),
        ),
      }
    }
    if (sigGaps.length === 0) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer(
          'Różnice Prim–Kruskal są małe względem zmienności we wszystkich topologiach — wynik nierozstrzygnięty'
          + (confound ? ' (dodatkowo: E/gęstość nie były w pełni kontrolowane).' : '.'),
        ),
      }
    }
    return {
      verdict: 'unsupported',
      note: withDisclaimer(
        'Względna wydajność Prima i Kruskala nie zmienia się wyraźnie między topologiami w tej serii'
        + (confound
          ? '. Uwaga: przy zmianie topologii zmieniały się też E/gęstość — interpretacja „czystego” wpływu struktury jest ograniczona.'
          : '.'),
      ),
    }
  }

  // ——— H4: BFS vs DFS — różnice zależne od struktury ———
  if (h === 'H4') {
    if (group !== 'search') {
      return mismatchNote('oczekiwana para BFS / DFS (grupa search)')
    }
    if (kind !== 'structure') {
      return mismatchNote('oczekiwane badanie structure (różne topologie)')
    }
    const topologies = new Set(points.map(p => p.topology))
    if (topologies.size < 2) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer('Za mało różnych topologii w kompletnych parach — nie można ocenić H4.'),
      }
    }
    const edgeVals = points.map(p => p.edges)
    const densVals = points.map(p => p.density)
    const confound =
      Math.max(...edgeVals) - Math.min(...edgeVals) > Math.max(1, Math.min(...edgeVals) * 0.15)
      || Math.max(...densVals) - Math.min(...densVals) > 5

    const winners = points.filter(p => p.faster != null).map(p => p.faster!)
    const distinctWinners = new Set(winners)
    const sigGaps = points.filter(p => p.significant)
    const relativeGaps = points.map(p => {
      const slower = Math.max(p.meanA, p.meanB)
      return slower > 0 ? p.gap / slower : 0
    })
    const maxRel = Math.max(...relativeGaps)
    const minRel = Math.min(...relativeGaps)

    if (distinctWinners.size >= 2 || (sigGaps.length >= 2 && maxRel > minRel * 1.5 + 1e-9)) {
      return {
        verdict: 'supported',
        note: withDisclaimer(
          `Zaobserwowano różnice wydajności BFS/DFS zależne od topologii`
          + (confound
            ? '. Uwaga: jednocześnie zmieniały się E i/lub gęstość — nie przypisuj efektu wyłącznie strukturze.'
            : ', mimo podobnej złożoności asymptotycznej O(V+E).'),
        ),
      }
    }
    if (sigGaps.length === 0) {
      return {
        verdict: 'inconclusive',
        note: withDisclaimer(
          'Różnice BFS–DFS są małe względem zmienności we wszystkich topologiach — wynik nierozstrzygnięty'
          + (confound ? ' (E/gęstość także się zmieniały).' : '.'),
        ),
      }
    }
    return {
      verdict: 'unsupported',
      note: withDisclaimer(
        'W tej serii różnice BFS–DFS nie zależą wyraźnie od struktury grafu'
        + (confound
          ? '. Przy zmianie topologii zmieniały się też E/gęstość — ostrożna interpretacja.'
          : '.'),
      ),
    }
  }

  return {
    verdict: 'inconclusive',
    note: withDisclaimer('Nieznana lub nieobsługiwana hipoteza — brak automatycznej sugestii.'),
  }
}

export function exportResearchJSON(study: ResearchStudy): string {
  // Nie zapisujemy pełnych grafów — tylko parametry i wyniki.
  return JSON.stringify(study, null, 2)
}

export function exportResearchCSV(study: ResearchStudy): string {
  const rows = study.cases.flatMap(c => c.results.map(r => ({
    ...r,
    sourceLabel: `${study.name} · ${c.plan.label}`,
  })))
  // Reuse CSV builder via temporary download helper internals:
  const header = [
    'badanie', 'przypadek', 'topologia', 'V', 'E', 'gestosc', 'spojnosc', 'algorytm',
    'powtorzenia', 'seed', 'srednia_ms', 'mediana_ms', 'odch_std_ms', 'min_ms', 'max_ms',
    'operacje', 'status', 'generate_ms',
  ]
  const lines = study.cases.flatMap(c => c.results.map(r => [
    JSON.stringify(study.name),
    JSON.stringify(c.plan.label),
    c.plan.topology,
    c.actualVertices,
    c.actualEdges,
    c.actualDensity,
    c.connected ? 1 : 0,
    algorithmLabels[r.algorithm],
    r.repetitions,
    c.plan.seed,
    r.mean.toFixed(5),
    r.median.toFixed(5),
    r.stdDev.toFixed(5),
    r.min.toFixed(5),
    r.max.toFixed(5),
    r.operations,
    r.status ?? 'ran',
    c.generateMs.toFixed(3),
  ].join(',')))
  void rows
  void exportCSV
  return [header.join(','), ...lines].join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function loadResearchStudies(): ResearchStudy[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(item => item && typeof item === 'object' && typeof item.id === 'string') as ResearchStudy[]
  } catch {
    return []
  }
}

export function saveResearchStudy(study: ResearchStudy) {
  const stamped: ResearchStudy = {
    ...study,
    updatedAt: study.updatedAt || new Date().toISOString(),
  }
  const previous = loadResearchStudies().filter(s => s.id !== stamped.id)
  const next = [stamped, ...previous].slice(0, MAX_STORED_STUDIES)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function deleteResearchStudy(id: string) {
  const next = loadResearchStudies().filter(s => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function defaultResearchConfig(): ResearchConfig {
  return {
    name: 'Seria badawcza',
    studyKind: 'vertices',
    group: 'shortest',
    topology: 'erdos',
    topologies: ['erdos', 'sparse', 'dense', 'tree', 'path', 'cycle', 'bipartite'],
    vertices: 500,
    vertexSizes: [100, 500, 1000],
    densityPercent: 10,
    densitySweep: [5, 15, 30, 45],
    edgeSweep: [500, 1000, 2500, 5000],
    repetitions: 5,
    seed: 12345,
    weightMin: 1,
    weightMax: 20,
    directed: false,
    hypothesis: 'H2',
  }
}
